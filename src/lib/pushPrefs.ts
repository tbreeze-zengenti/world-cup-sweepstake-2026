import type { FollowTarget } from './push'

/**
 * localStorage hint for the push opt-in UI. The server blob is the source
 * of truth for delivery and the browser PushSubscription for the channel —
 * this is only a cached copy of the user's last confirmed selection, written
 * after (never before) a successful server POST.
 */
export interface PushPrefs {
  enabled: boolean
  target: FollowTarget
}

const KEY = 'push-prefs'

function isFollowTarget(v: unknown): v is FollowTarget {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  if (t.kind === 'all') return true
  return (
    t.kind === 'people' &&
    Array.isArray(t.names) &&
    t.names.length > 0 &&
    t.names.every((n) => typeof n === 'string')
  )
}

export function loadPushPrefs(): PushPrefs | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (typeof v?.enabled === 'boolean' && isFollowTarget(v.target)) {
        return { enabled: v.enabled, target: v.target }
      }
    }
  } catch {
    // corrupt or unavailable storage — treat as no preference
  }
  return null
}

export function savePushPrefs(prefs: PushPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable — prefs just won't persist across visits
  }
}

export function clearPushPrefs(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
