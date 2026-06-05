import type { Match } from '../../../src/lib/types'

/**
 * Shape of a single fixture in an API-Football v3 /fixtures response —
 * only the fields we consume. https://www.api-football.com/documentation-v3
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

/** Value stored in the Netlify Blob (store "match-data", key "overlay"). */
export interface OverlayBlob {
  updatedAt: string
  /** API fixture id → match id ("m42"); sticky once a binding is learned. */
  fixtureMap: Record<string, string>
  /** match id → overlay */
  overlays: Record<string, MatchOverlay>
}

export const BLOB_STORE = 'match-data'
export const BLOB_KEY = 'overlay'
