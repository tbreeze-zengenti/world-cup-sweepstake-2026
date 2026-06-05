import webpush from 'web-push'
import type { PushPayload, PushSubscriptionWire } from '../../../src/lib/push'

/**
 * Narrow sender interface over web-push, so the orchestrator and tests
 * depend on our type (and the 404/410 prune logic keys off a guaranteed
 * statusCode), not the library's loosely typed error.
 */
export type PushSender = (
  sub: PushSubscriptionWire,
  payload: PushPayload,
) => Promise<{ statusCode: number }>

/** Stale kick-off alerts are worthless — don't let push services hold them long. */
const TTL_SECONDS = 3600
/** A single hung push endpoint must never eat the scheduled function's budget. */
const SEND_TIMEOUT_MS = 5000

/**
 * Build a sender bound to the VAPID env, or null when unconfigured.
 * Null means log-and-skip — unlike FOOTBALL_DATA_TOKEN, missing push keys
 * must never throw and take the live-data poll down with them.
 */
export function createSender(env: {
  publicKey?: string
  privateKey?: string
  subject?: string
}): PushSender | null {
  const { publicKey, privateKey, subject } = env
  if (!publicKey || !privateKey || !subject) return null
  return async (sub, payload) => {
    try {
      const res = await webpush.sendNotification(sub, JSON.stringify(payload), {
        TTL: TTL_SECONDS,
        urgency: 'high',
        timeout: SEND_TIMEOUT_MS,
        vapidDetails: { subject, publicKey, privateKey },
      })
      return { statusCode: res.statusCode }
    } catch (err) {
      // WebPushError carries the push service's status (404/410 = dead sub).
      const statusCode = (err as { statusCode?: unknown }).statusCode
      if (typeof statusCode === 'number') return { statusCode }
      throw err // network/timeout — transient, the caller just counts it
    }
  }
}
