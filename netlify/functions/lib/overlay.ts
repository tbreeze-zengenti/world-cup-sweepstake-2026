import type { Match } from '../../../src/lib/types'

/**
 * Internal normalised fixture shape consumed by matching.ts/transform.ts
 * (modelled on API-Football v3); provider responses are adapted into it —
 * see footballData.ts.
 */
export interface ApiFixture {
  fixture: {
    id: number
    /** kickoff, UNIX epoch seconds */
    timestamp: number
    status: { short: string }
  }
  teams: {
    home: { name: string }
    away: { name: string }
  }
  goals: { home: number | null; away: number | null }
  score: {
    penalty: { home: number | null; away: number | null }
  }
}

/** API-derived patch for one match; merged over the static matches.json. */
export interface MatchOverlay {
  status: Match['status']
  score?: { home: number; away: number }
  shootout?: { home: number; away: number }
  /** Resolved team slugs — replaces knockout placeholders like "W85". */
  home?: string
  away?: string
}

/** Push notification events derived from status transitions. */
export type MatchEvent = 'started' | 'ended'

/**
 * Value stored in the Netlify Blob (store "match-data", key "overlay").
 *
 * Invariant: mergeMatches reads fields by name and never spreads the whole
 * blob into the /matches.json response — that is what keeps `notified` (and
 * any future bookkeeping) out of the public payload. Don't change that to a
 * spread.
 */
export interface OverlayBlob {
  updatedAt: string
  /** API fixture id → match id ("m42"); sticky once a binding is learned. */
  fixtureMap: Record<string, string>
  /** match id → overlay */
  overlays: Record<string, MatchOverlay>
  /**
   * Push dedupe markers: match id → event → ISO timestamp of the send claim.
   * Monotonic and merge-only — committed via compare-and-swap *before*
   * sending (at-most-once), never cleared during the tournament. Bounded:
   * ≤104 matches × 2 events ≈ a few KB.
   */
  notified?: Record<string, Partial<Record<MatchEvent, string>>>
}

export const BLOB_STORE = 'match-data'
export const BLOB_KEY = 'overlay'
