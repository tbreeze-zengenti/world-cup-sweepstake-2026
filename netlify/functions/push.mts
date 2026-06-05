/**
 * /api/push — Web Push subscription endpoint.
 *
 *   GET    → { publicKey }   the VAPID public key (cached by app + SW)
 *   POST   → upsert a subscription; `people` absent preserves the stored
 *            target, `oldEndpoint` migrates it after a browser rotation
 *   DELETE → remove a subscription (idempotent)
 *
 * Deliberately unauthenticated (public, low-stakes site) but hardened:
 * endpoints must be HTTPS on a known push-service host (we fetch() them
 * later — an arbitrary URL would make the poller an SSRF probe / request
 * amplifier), bodies are size-capped, and nothing ever lists or returns
 * stored subscriptions. No CSRF token by design: there is no cookie/auth
 * state to ride, so a forged request can only register the victim's own
 * real subscription.
 */
import { getStore } from '@netlify/blobs'
import type { Config } from '@netlify/functions'
import sweepstake from '../../data/sweepstake.json'
import { personName } from '../../src/lib/holders'
import type { FollowTarget } from '../../src/lib/push'
import {
  endpointKey,
  parseDeleteRequest,
  parseSubscribeRequest,
  SUBS_STORE,
  type StoredSubscription,
} from './lib/subscriptions'

const MAX_BODY_BYTES = 4096

const VALID_NAMES: ReadonlySet<string> = new Set(sweepstake.map((e) => personName(e.name)))

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-cache' },
  })

async function readBody(req: Request): Promise<unknown | undefined> {
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export default async (req: Request): Promise<Response> => {
  // Strong consistency: a POST followed by the poller's read moments later
  // (or a re-subscribe reading its own prior state) must not see stale data.
  const store = getStore({ name: SUBS_STORE, consistency: 'strong' })

  if (req.method === 'GET') {
    const publicKey = process.env.VAPID_PUBLIC_KEY
    if (!publicKey) return json(503, { error: 'push not configured' })
    return json(200, { publicKey })
  }

  if (req.method === 'POST') {
    const parsed = parseSubscribeRequest(await readBody(req), VALID_NAMES)
    if (!parsed) return json(400, { error: 'invalid subscription request' })

    const key = endpointKey(parsed.subscription.endpoint)
    const existing = ((await store.get(key, { type: 'json' })) ?? null) as StoredSubscription | null

    // Resolve the follow target: explicit > migrated from rotated endpoint >
    // already stored. A SW re-subscribe never knows the user's selection
    // (localStorage is unreachable in a worker), so absence means "keep".
    let people: FollowTarget | undefined = parsed.people
    let createdAt = existing?.createdAt
    let oldKey: string | undefined
    if (parsed.oldEndpoint && parsed.oldEndpoint !== parsed.subscription.endpoint) {
      oldKey = endpointKey(parsed.oldEndpoint)
      const old = ((await store.get(oldKey, { type: 'json' })) ?? null) as StoredSubscription | null
      people ??= old?.people
      createdAt ??= old?.createdAt
    }
    people ??= existing?.people
    // Nothing to preserve and nothing asked for: refuse rather than invent a
    // selection — the app's re-sync-on-mount re-POSTs with real prefs.
    if (!people) return json(422, { error: 'no follow target' })

    const now = new Date().toISOString()
    const stored: StoredSubscription = {
      ...parsed.subscription,
      people,
      createdAt: createdAt ?? now,
      updatedAt: now,
    }
    await store.setJSON(key, stored)
    if (oldKey) await store.delete(oldKey) // rotation: old endpoint is gone for good
    return json(200, { ok: true })
  }

  if (req.method === 'DELETE') {
    const endpoint = parseDeleteRequest(await readBody(req))
    if (!endpoint) return json(400, { error: 'invalid request' })
    await store.delete(endpointKey(endpoint)) // idempotent — missing blob is success
    return json(200, { ok: true })
  }

  return json(405, { error: 'method not allowed' })
}

export const config: Config = { path: '/api/push' }
