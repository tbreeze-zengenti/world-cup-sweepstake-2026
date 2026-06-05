import { createHash } from 'node:crypto'
import type { getStore } from '@netlify/blobs'
import type { FollowTarget, PushSubscriptionWire, SubscribeRequest } from '../../../src/lib/push'

/** One blob per subscription, keyed by sha256(endpoint) — per-key blobs
 *  mean concurrent subscribers never clobber each other (Blobs are
 *  last-write-wins with no locking). */
export const SUBS_STORE = 'push-subscriptions'

type BlobStore = ReturnType<typeof getStore>

export interface StoredSubscription extends PushSubscriptionWire {
  people: FollowTarget
  createdAt: string
  updatedAt: string
}

/** A loaded subscription plus the etag captured at read time, so prunes can
 *  be conditional (a re-subscribed endpoint must never be deleted by a stale
 *  410 from a send made against its previous incarnation). */
export interface SubscriptionRecord {
  key: string
  etag?: string
  sub: StoredSubscription
}

export const endpointKey = (endpoint: string): string =>
  createHash('sha256').update(endpoint).digest('hex')

/**
 * Push-service host allowlist. POSTed endpoints are later fetch()ed by our
 * poller, so an arbitrary URL would make us an SSRF probe / third-party
 * request amplifier. Suffix-matched against the endpoint hostname.
 */
const ALLOWED_HOST_SUFFIXES = [
  'googleapis.com', // Chrome/FCM
  'push.services.mozilla.com', // Firefox
  'notify.windows.com', // Edge/WNS
  'push.apple.com', // Safari
]

const MAX_ENDPOINT_LENGTH = 1024
const MAX_NAME_LENGTH = 100
const BASE64URL = /^[A-Za-z0-9_-]+$/

export function isAllowedEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH)
    return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname
  return ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))
}

function parseKeys(input: unknown): PushSubscriptionWire['keys'] | null {
  if (typeof input !== 'object' || input === null) return null
  const { p256dh, auth } = input as Record<string, unknown>
  // p256dh is an uncompressed P-256 point (~87 base64url chars), auth ~22.
  if (typeof p256dh !== 'string' || p256dh.length > 256 || !BASE64URL.test(p256dh)) return null
  if (typeof auth !== 'string' || auth.length > 64 || !BASE64URL.test(auth)) return null
  return { p256dh, auth }
}

function parseFollowTarget(input: unknown, validNames: ReadonlySet<string>): FollowTarget | null {
  if (typeof input !== 'object' || input === null) return null
  const v = input as Record<string, unknown>
  if (v.kind === 'all') return { kind: 'all' }
  if (v.kind === 'people' && Array.isArray(v.names)) {
    if (v.names.length === 0 || v.names.length > validNames.size) return null
    const names: string[] = []
    for (const name of v.names) {
      if (typeof name !== 'string' || name.length > MAX_NAME_LENGTH || !validNames.has(name))
        return null
      if (!names.includes(name)) names.push(name)
    }
    return { kind: 'people', names }
  }
  return null
}

/**
 * Validate an untrusted POST body into a SubscribeRequest, or null.
 * validNames are the collapsed sweepstake person names.
 */
export function parseSubscribeRequest(
  input: unknown,
  validNames: ReadonlySet<string>,
): SubscribeRequest | null {
  if (typeof input !== 'object' || input === null) return null
  const v = input as Record<string, unknown>
  if (typeof v.subscription !== 'object' || v.subscription === null) return null
  const s = v.subscription as Record<string, unknown>
  if (!isAllowedEndpoint(s.endpoint)) return null
  const keys = parseKeys(s.keys)
  if (!keys) return null

  const out: SubscribeRequest = { subscription: { endpoint: s.endpoint, keys } }
  if (v.people !== undefined) {
    const people = parseFollowTarget(v.people, validNames)
    if (!people) return null
    out.people = people
  }
  if (v.oldEndpoint !== undefined) {
    if (!isAllowedEndpoint(v.oldEndpoint)) return null
    out.oldEndpoint = v.oldEndpoint
  }
  return out
}

/** Validate a DELETE body ({ endpoint }) into the endpoint string, or null. */
export function parseDeleteRequest(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null
  const v = input as Record<string, unknown>
  return isAllowedEndpoint(v.endpoint) ? v.endpoint : null
}

function isStoredSubscription(v: unknown): v is StoredSubscription {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    typeof s.endpoint === 'string' &&
    typeof s.keys === 'object' &&
    s.keys !== null &&
    typeof s.people === 'object' &&
    s.people !== null
  )
}

/**
 * Load every stored subscription with strong consistency (a sub created
 * moments before its team's kickoff must not be missed) — parallel chunked
 * reads, because strong must never mean serial: 200 serial strong reads
 * would eat half the scheduled function's 30s budget on their own.
 */
export async function loadSubscriptions(
  store: BlobStore,
  concurrency = 25,
): Promise<SubscriptionRecord[]> {
  const { blobs } = await store.list()
  const records: SubscriptionRecord[] = []
  for (let i = 0; i < blobs.length; i += concurrency) {
    const chunk = blobs.slice(i, i + concurrency)
    const loaded = await Promise.all(
      chunk.map(async (b) => {
        const res = await store.getWithMetadata(b.key, { type: 'json', consistency: 'strong' })
        if (!res || !isStoredSubscription(res.data)) return null
        return { key: b.key, etag: res.etag, sub: res.data } satisfies SubscriptionRecord
      }),
    )
    for (const r of loaded) if (r) records.push(r)
  }
  return records
}
