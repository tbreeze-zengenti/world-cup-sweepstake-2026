import type { Match } from '../../../src/lib/types'
import { apiTeamToSlug } from './apiNameMap'
import type { ApiFixture, MatchOverlay } from './overlay'

// API-Football fixture.status.short values, grouped.
const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'])
const FINISHED = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO'])

export function mapStatus(short: string): Match['status'] {
  if (FINISHED.has(short)) return 'finished'
  if (LIVE.has(short)) return 'live'
  return 'scheduled' // NS, TBD, PST, CANC, ABD, …
}

/** Transform one API fixture into the overlay for the given static match. */
export function fixtureToOverlay(
  fx: ApiFixture,
  match: Match,
  validSlugs: ReadonlySet<string>,
): MatchOverlay {
  const short = fx.fixture.status.short
  const overlay: MatchOverlay = { status: mapStatus(short) }

  const home = apiTeamToSlug(fx.teams.home.name, validSlugs)
  const away = apiTeamToSlug(fx.teams.away.name, validSlugs)

  // Group matches keep the static orientation (hand-entered cards depend on
  // it) and flip the score if the API lists the sides the other way round.
  // Knockouts adopt the API orientation wholesale — sides and score arrive
  // together, which is also what resolves placeholders like "W85".
  const swap = match.stage === 'group' && home != null && home === match.away
  if (match.stage !== 'group') {
    if (home) overlay.home = home
    if (away) overlay.away = away
  }

  if (overlay.status !== 'scheduled') {
    const { home: gh, away: ga } = fx.goals
    if (gh != null && ga != null) {
      overlay.score = swap ? { home: ga, away: gh } : { home: gh, away: ga }
    }
    const pen = fx.score.penalty
    // A shootout can never be a draw. football-data.org occasionally reports an
    // inconsistent penalties pair in the minutes after a match settles (we've
    // seen home mirror away, e.g. a real 3-4 served as 4-4), so reject an equal
    // pair rather than serve impossible data — a later poll picks up the
    // corrected, decisive score. Mirrors apply-results.mjs / data.test.ts.
    if (short === 'PEN' && pen.home != null && pen.away != null && pen.home !== pen.away) {
      overlay.shootout = swap
        ? { home: pen.away, away: pen.home }
        : { home: pen.home, away: pen.away }
    }
  }
  return overlay
}
