import type { SweepstakeEntry, Team } from './types'

/** "Al Roberts 2" → "Al Roberts" — groups a person's two entries together. */
export const personName = (entryName: string): string => entryName.replace(/ 2$/, '')

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
