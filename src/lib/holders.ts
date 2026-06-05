import type { FollowTarget } from './push'
import type { SweepstakeEntry, Team } from './types'

/** "Al Roberts 2" → "Al Roberts" — groups a person's two entries together. */
export const personName = (entryName: string): string => entryName.replace(/ 2$/, '')

/**
 * Team slugs covered by a follow target. Following a person covers all of
 * their entries ("Kyle" → Australia and Saudi Arabia via "Kyle 2").
 * DOM-free on purpose — the push send plan uses this from Netlify functions.
 */
export function followedSlugs(
  target: FollowTarget,
  sweepstake: SweepstakeEntry[],
  teams: Team[],
): Set<string> {
  const teamByName = new Map(teams.map((t) => [t.name, t]))
  const entries =
    target.kind === 'all'
      ? sweepstake
      : sweepstake.filter((e) => target.names.includes(personName(e.name)))
  return new Set(entries.map((e) => teamByName.get(e.team)?.slug).filter((s): s is string => !!s))
}

/** team slug → sweepstake entry (1:1, enforced by data tests) */
export function holdersByTeam(sweepstake: SweepstakeEntry[], teams: Team[]): Map<string, SweepstakeEntry> {
  const teamByName = new Map(teams.map((t) => [t.name, t]))
  const out = new Map<string, SweepstakeEntry>()
  for (const entry of sweepstake) {
    const team = teamByName.get(entry.team)
    if (team) out.set(team.slug, entry)
  }
  return out
}
