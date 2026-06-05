import { useEffect, useRef, useState } from 'react'
import type { FollowTarget, PushSubscriptionWire, SubscribeRequest } from './lib/push'
import { clearPushPrefs, loadPushPrefs, savePushPrefs } from './lib/pushPrefs'

/**
 * Push opt-in state machine. Capability facts (unsupported / iOS-not-
 * installed), the platform permission, our server-sync fact (subscribed)
 * and the transient op state are kept distinct — flattening them loses
 * information the UI needs (e.g. busy vs denied vs error-with-retry).
 */
export type PushState =
  | { kind: 'unsupported' }
  | { kind: 'ios-needs-install' }
  | { kind: 'idle'; permission: NotificationPermission }
  | { kind: 'busy' }
  | { kind: 'subscribed'; target: FollowTarget }
  | { kind: 'error'; message: string }

const API = '/api/push'
const READY_TIMEOUT_MS = 10_000

export interface PushEnv {
  hasServiceWorker: boolean
  hasNotification: boolean
  hasPushManager: boolean
  isIOS: boolean
  isStandalone: boolean
}

/** Pure capability gate — exported for tests. */
export function capability(env: PushEnv): 'supported' | 'unsupported' | 'ios-needs-install' {
  const pushReady = env.hasServiceWorker && env.hasNotification && env.hasPushManager
  if (pushReady) return 'supported'
  // iOS Safari hides Push/Notification until the site runs as an installed
  // PWA — that is an instruction problem, not a missing feature.
  if (env.isIOS && !env.isStandalone) return 'ios-needs-install'
  return 'unsupported'
}

function readEnv(): PushEnv {
  return {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasNotification: 'Notification' in window,
    hasPushManager: 'PushManager' in window,
    isIOS:
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    isStandalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true),
  }
}

/**
 * navigator.serviceWorker.ready never rejects — if registration failed it
 * hangs forever, so every await of it must race a timeout. Generous value:
 * cold iOS standalone launches boot the worker slowly.
 */
function readyWithTimeout(ms = READY_TIMEOUT_MS): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Notifications took too long to start — try reloading.')),
      ms,
    )
    navigator.serviceWorker.ready.then((reg) => {
      clearTimeout(timer)
      resolve(reg)
    })
  })
}

/** base64url VAPID key → bytes for pushManager.subscribe. */
function keyToBytes(base64url: string): Uint8Array {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0))
}

let cachedPublicKey: string | undefined

async function getPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey
  const res = await fetch(API, { cache: 'no-cache' })
  if (!res.ok) throw new Error('Alerts aren’t configured yet — try again later.')
  const body = (await res.json()) as { publicKey?: string }
  if (typeof body.publicKey !== 'string') throw new Error('Alerts aren’t configured yet.')
  cachedPublicKey = body.publicKey
  return body.publicKey
}

function toWire(sub: PushSubscription): PushSubscriptionWire {
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('The browser returned an incomplete subscription.')
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }
}

async function postSubscription(body: SubscribeRequest): Promise<void> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Couldn’t save the subscription (${res.status}).`)
}

function initialState(): PushState {
  const cap = capability(readEnv())
  if (cap !== 'supported') return { kind: cap }
  const prefs = loadPushPrefs()
  // Optimistic: show the last confirmed selection immediately; the mount
  // re-sync below verifies it against the channel + server and downgrades
  // if either disagrees.
  if (Notification.permission === 'granted' && prefs?.enabled) {
    return { kind: 'subscribed', target: prefs.target }
  }
  return { kind: 'idle', permission: Notification.permission }
}

export interface PushApi {
  state: PushState
  subscribe: (target: FollowTarget) => Promise<void>
  update: (target: FollowTarget) => Promise<void>
  unsubscribe: () => Promise<void>
}

export function usePushNotifications(): PushApi {
  const [state, setState] = useState<PushState>(initialState)
  // Single in-flight gate: subscribe / update / unsubscribe / mount re-sync
  // never interleave (kills double-click double-POSTs and stale-write races).
  const opRef = useRef(false)
  const syncedRef = useRef(false)

  useEffect(() => {
    const cap = capability(readEnv())
    if (cap !== 'supported') return
    // One-shot (StrictMode double-invokes effects in dev), cancellable.
    if (syncedRef.current) return
    syncedRef.current = true
    let cancelled = false

    // Registration is cheap and idempotent — kick it off now so .ready has a
    // head start by the time the user clicks the bell.
    navigator.serviceWorker.register('/sw.js').catch(() => {})

    // Re-sync: the primary recovery path on iOS, where pushsubscriptionchange
    // is unreliable. Confirms the server still holds this endpoint + prefs
    // (heals a pruned blob or a POST that failed after subscribing).
    const prefs = loadPushPrefs()
    if (!prefs?.enabled) return
    ;(async () => {
      try {
        const reg = await readyWithTimeout()
        const sub = await reg.pushManager.getSubscription()
        if (cancelled || opRef.current) return
        if (!sub) {
          // channel gone — nothing can be delivered; reflect reality
          clearPushPrefs()
          setState({ kind: 'idle', permission: Notification.permission })
          return
        }
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            subscription: toWire(sub),
            people: prefs.target,
          } satisfies SubscribeRequest),
        })
        if (cancelled || opRef.current) return
        if (!res.ok) {
          clearPushPrefs()
          setState({ kind: 'idle', permission: Notification.permission })
        }
        // network errors: keep the optimistic state — offline ≠ unsubscribed
      } catch {
        // SW never became ready — leave whatever state we showed; the user
        // can still act, and acting surfaces a real error message.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const run = async (op: () => Promise<PushState>) => {
    if (opRef.current) return
    opRef.current = true
    setState({ kind: 'busy' })
    try {
      setState(await op())
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      opRef.current = false
    }
  }

  const subscribe = (target: FollowTarget) =>
    run(async () => {
      // Permission first — synchronously inside the click. Awaiting anything
      // beforehand (e.g. serviceWorker.ready) breaks WebKit's gesture
      // association and the prompt is silently suppressed.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return { kind: 'idle', permission }
      const reg = await readyWithTimeout()
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyToBytes(await getPublicKey()) as BufferSource,
        }))
      await postSubscription({ subscription: toWire(sub), people: target })
      savePushPrefs({ enabled: true, target })
      return { kind: 'subscribed', target }
    })

  const update = (target: FollowTarget) =>
    run(async () => {
      const reg = await readyWithTimeout()
      const sub = await reg.pushManager.getSubscription()
      if (!sub) {
        clearPushPrefs()
        throw new Error('The subscription was lost — turn alerts on again.')
      }
      await postSubscription({ subscription: toWire(sub), people: target })
      savePushPrefs({ enabled: true, target })
      return { kind: 'subscribed', target }
    })

  const unsubscribe = () =>
    run(async () => {
      const reg = await readyWithTimeout()
      const sub = await reg.pushManager.getSubscription()
      const endpoint = sub?.endpoint
      // Browser first — that's what actually stops delivery, and what the
      // mount re-sync keys off (DELETE-first risks resurrection on revisit).
      if (sub) await sub.unsubscribe()
      clearPushPrefs()
      if (endpoint) {
        // Best effort: a failed DELETE leaves a dead blob that self-prunes
        // on the next send (410).
        await fetch(API, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {})
      }
      return { kind: 'idle', permission: Notification.permission }
    })

  return { state, subscribe, update, unsubscribe }
}
