import { apiTeamToSlug } from './apiNameMap'
import type { ApiFixture } from './overlay'

/**
 * One match in a football-data.org v4 /competitions/WC/matches response —
 * only the fields we consume. https://docs.football-data.org/general/v4/
 */
export interface FdMatch {
  id: number
  utcDate: string
  status: string // SCHEDULED | TIMED | IN_PLAY | PAUSED | SUSPENDED | POSTPONED | CANCELLED | AWARDED | FINISHED
  homeTeam: { name: string | null; shortName: string | null }
  awayTeam: { name: string | null; shortName: string | null }
  score: {
    duration: string // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
    fullTime: { home: number | null; away: number | null }
    regularTime?: { home: number | null; away: number | null }
    extraTime?: { home: number | null; away: number | null }
    penalties?: { home: number | null; away: number | null }
  }
}

/** football-data.org status → the API-Football-style codes transform.ts groups on. */
const STATUS_TO_SHORT: Record<string, string> = {
  IN_PLAY: 'LIVE',
  PAUSED: 'HT',
  SUSPENDED: 'SUSP',
  FINISHED: 'FT', // becomes PEN below when decided by shootout
  AWARDED: 'AWD',
  SCHEDULED: 'NS',
  TIMED: 'NS',
  POSTPONED: 'PST',
  CANCELLED: 'CANC',
}

/** Prefer whichever of name/shortName resolves to one of our team slugs. */
const teamName = (
  t: FdMatch['homeTeam'],
  validSlugs: ReadonlySet<string>,
): string => {
  for (const n of [t.name, t.shortName]) {
    if (n && apiTeamToSlug(n, validSlugs)) return n
  }
  return t.name ?? t.shortName ?? 'TBD'
}

/**
 * Normalise a football-data.org match into our internal fixture shape so
 * matching.ts and transform.ts work unchanged.
 *
 * Goals: for a shootout match we want the drawn after-extra-time score
 * (shootout goals are kept separate in our schema), so prefer
 * regularTime + extraTime when present rather than trusting fullTime's
 * treatment of penalties.
 */
export function toApiFixture(m: FdMatch, validSlugs: ReadonlySet<string>): ApiFixture {
  const short =
    m.status === 'FINISHED' && m.score.duration === 'PENALTY_SHOOTOUT'
      ? 'PEN'
      : (STATUS_TO_SHORT[m.status] ?? 'NS')

  let goals: { home: number | null; away: number | null } = m.score.fullTime
  if (m.score.duration === 'PENALTY_SHOOTOUT') {
    const rt = m.score.regularTime
    const et = m.score.extraTime
    if (rt?.home != null && rt.away != null && et?.home != null && et.away != null) {
      goals = { home: rt.home + et.home, away: rt.away + et.away }
    }
  }

  return {
    fixture: {
      id: m.id,
      timestamp: Math.floor(Date.parse(m.utcDate) / 1000),
      status: { short },
    },
    teams: {
      home: { name: teamName(m.homeTeam, validSlugs) },
      away: { name: teamName(m.awayTeam, validSlugs) },
    },
    goals,
    score: {
      penalty: m.score.penalties ?? { home: null, away: null },
    },
  }
}
