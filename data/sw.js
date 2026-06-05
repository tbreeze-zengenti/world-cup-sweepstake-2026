// @ts-check
/// <reference lib="webworker" />
/**
 * Root-scoped service worker for Web Push match alerts. Lives in data/
 * (Vite's repurposed publicDir) so it deploys verbatim to /sw.js; served
 * with Cache-Control: no-cache via netlify.toml. Type-checked by
 * tsconfig.sw.json under the WebWorker lib — not part of the app bundle.
 */
const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self))

const VAPID_CACHE = 'vapid-key-v1'
const API = '/api/push'

// Best effort: cache the VAPID public key at install so a later
// pushsubscriptionchange can re-subscribe even when it fires offline.
sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VAPID_CACHE)
      .then((cache) => cache.add(API))
      .catch(() => {}),
  )
  sw.skipWaiting()
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim())
})

sw.addEventListener('push', (event) => {
  /** @type {import('../src/lib/push').PushPayload | null} */
  let payload = null
  try {
    payload = event.data ? event.data.json() : null
  } catch {
    // malformed payload — never throw unhandled inside the SW
  }
  if (!payload || typeof payload.title !== 'string') return
  event.waitUntil(
    sw.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag, // duplicate (match, event) replaces, never stacks
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data,
    }),
  )
})

sw.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Single-route SPA: focus any open tab, otherwise open the app root.
  // The URL is server-built and fixed — never derived from subscription data.
  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients[0]
      return client ? client.focus() : sw.clients.openWindow('/')
    }),
  )
})

/**
 * base64url VAPID key → bytes for pushManager.subscribe.
 * @param {string} base64url
 */
function keyToBytes(base64url) {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0))
}

/** Cache-first VAPID public key; a successful network fetch refreshes the cache. */
async function getPublicKey() {
  const cache = await caches.open(VAPID_CACHE)
  try {
    const res = await fetch(API)
    if (res.ok) {
      await cache.put(API, res.clone())
      const body = await res.json()
      if (typeof body.publicKey === 'string') return body.publicKey
    }
  } catch {
    // offline — fall through to the cached copy
  }
  const cached = await cache.match(API)
  if (cached) {
    const body = await cached.json()
    if (typeof body.publicKey === 'string') return body.publicKey
  }
  return null
}

// The browser rotated/expired the subscription. Re-subscribe and tell the
// server, sending oldEndpoint and *no* `people` field — the SW can't read
// the user's prefs (localStorage is unreachable here), so the server
// migrates the stored selection from the old endpoint to the new one.
// No cached key + offline is the one unrecoverable case; the app's
// re-sync-on-mount heals it the next time the site is opened online.
sw.addEventListener('pushsubscriptionchange', (event) => {
  const change =
    /** @type {{ oldSubscription?: PushSubscription | null, waitUntil(p: Promise<unknown>): void }} */ (
      /** @type {unknown} */ (event)
    )
  change.waitUntil(
    (async () => {
      const oldEndpoint =
        change.oldSubscription?.endpoint ??
        (await sw.registration.pushManager.getSubscription())?.endpoint
      const publicKey = await getPublicKey()
      if (!publicKey) return
      const sub = await sw.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(publicKey),
      })
      await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          ...(oldEndpoint ? { oldEndpoint } : {}),
        }),
      })
    })(),
  )
})
