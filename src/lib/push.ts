/**
 * Shared wire contract between the app, the service worker and the push
 * Netlify function. DOM-free — safe to import from both tsconfig projects
 * (the dependency direction is netlify → src/lib, never the reverse).
 */

export type FollowTarget = { kind: 'all' } | { kind: 'people'; names: string[] }

/** `PushSubscription.toJSON()` shape — also exactly what web-push consumes. */
export interface PushSubscriptionWire {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface SubscribeRequest {
  subscription: PushSubscriptionWire
  /** Absent on a SW-driven re-subscribe → server preserves the stored target. */
  people?: FollowTarget
  /** Present on rotation → server migrates the target and deletes the old blob. */
  oldEndpoint?: string
}

/** Payload encrypted into each push message; parsed defensively by sw.js. */
export interface PushPayload {
  title: string
  body: string
  /** "<matchId>-<event>" — replaces rather than stacks duplicate notifications. */
  tag: string
  /** url lives under data — notificationclick reads event.notification.data. */
  data: { url: string }
}
