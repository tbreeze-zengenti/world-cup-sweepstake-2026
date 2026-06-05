import type { Match } from '../../../src/lib/types'
import { apiTeamToSlug } from './apiNameMap'
import type { ApiFixture } from './overlay'

/** Max drift between the API kickoff and ours when binding by time. */
const TOLERANCE_MS = 90 * 60 * 1000

const kickoffMs = (m: Match) => new Date(m.kickoff).getTime()
const pairKey = (a: string, b: string) => [a, b].sort().join('|')

/**
 * Extend the API-fixture-id → match-id map. Existing bindings are sticky.
 *
 * Group stage binds by unordered team-slug pair (11 final-round kickoff slots
 * hold two simultaneous matches, so time alone is ambiguous), with a kickoff
 * sanity check so a knockout rematch of a group pairing can't rebind the
 * group match. Knockouts bind by kickoff time — all 32 are unique — since our
 * sides may still be placeholders like "W85".
 */
export function matchFixtures(
  apiFixtures: ApiFixture[],
  matches: Match[],
  validSlugs: ReadonlySet<string>,
  priorMap: Record<string, string>,
  warn: (msg: string) => void = console.warn,
): Record<string, string> {
  const map = { ...priorMap }
  const bound = new Set(Object.values(map))

  const groupByPair = new Map<string, Match>()
  for (const m of matches) {
    if (m.stage === 'group') groupByPair.set(pairKey(m.home, m.away), m)
  }
  const knockouts = matches.filter((m) => m.stage !== 'group')

  for (const fx of apiFixtures) {
    const fid = String(fx.fixture.id)
    if (map[fid]) continue
    const apiKickoff = fx.fixture.timestamp * 1000
    const near = (m: Match) => Math.abs(kickoffMs(m) - apiKickoff) <= TOLERANCE_MS

    const home = apiTeamToSlug(fx.teams.home.name, validSlugs)
    const away = apiTeamToSlug(fx.teams.away.name, validSlugs)
    if (home && away) {
      const m = groupByPair.get(pairKey(home, away))
      if (m && near(m) && !bound.has(m.id)) {
        map[fid] = m.id
        bound.add(m.id)
        continue
      }
    }

    const candidates = knockouts.filter((m) => near(m) && !bound.has(m.id))
    if (candidates.length === 1) {
      map[fid] = candidates[0].id
      bound.add(candidates[0].id)
    } else if (candidates.length > 1) {
      warn(
        `fixture ${fid} (${fx.teams.home.name} v ${fx.teams.away.name}) matches ` +
          `several knockout slots: ${candidates.map((m) => m.id).join(', ')} — skipped`,
      )
    }
  }
  return map
}
