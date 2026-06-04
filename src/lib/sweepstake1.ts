import type { Match, SweepstakeEntry, Team } from './types'
import { computeFates, type Fate } from './bracket'

export const PRIZES = {
  pot1Champion: 96,
  pot1RunnerUp: 48,
  pot2: 48,
  pot3: 48,
} as const

export interface EntrantStatus {
  entry: SweepstakeEntry
  team: Team
  fate: Fate
  /** £ amount, present only once the final is finished */
  prize?: number
}

export function entrantStatuses(
  sweepstake: SweepstakeEntry[],
  teams: Team[],
  matches: Match[],
): EntrantStatus[] {
  const fates = computeFates(teams, matches)
  const teamByName = new Map(teams.map((t) => [t.name, t]))
  const order: Fate[] = ['champion', 'runner-up', 'finalist', 'alive', 'limbo', 'eliminated']

  return sweepstake
    .map((entry) => {
      const team = teamByName.get(entry.team)
      if (!team) throw new Error(`Sweepstake team not found: ${entry.team}`)
      const fate = fates.get(team.slug) ?? 'alive'
      const prize =
        fate === 'champion' ? PRIZES.pot1Champion : fate === 'runner-up' ? PRIZES.pot1RunnerUp : undefined
      return { entry, team, fate, prize }
    })
    .sort((a, b) => order.indexOf(a.fate) - order.indexOf(b.fate) || a.entry.name.localeCompare(b.entry.name))
}
