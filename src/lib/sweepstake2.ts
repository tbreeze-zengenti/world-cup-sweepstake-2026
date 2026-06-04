import type { Match, Team } from './types'

export interface ConcededRow {
  slug: string
  played: number
  conceded: number
  scored: number
  /** current leader(s) of the pot */
  leading: boolean
}

export interface ConcededResult {
  rows: ConcededRow[]
  /** slugs splitting the prize (usually one) */
  winners: string[]
  /** all 72 group matches finished */
  final: boolean
}

/**
 * Sweepstake 2 (£48): most goals CONCEDED in the group stage.
 * Tiebreak: among tied teams, FEWEST goals scored wins; still tied → split.
 * Only finished matches count.
 */
export function rankConceded(teams: Team[], matches: Match[]): ConcededResult {
  const tally = new Map<string, { conceded: number; scored: number; played: number }>(
    teams.map((t) => [t.slug, { conceded: 0, scored: 0, played: 0 }]),
  )
  const groupMatches = matches.filter((m) => m.stage === 'group')
  for (const m of groupMatches) {
    if (m.status !== 'finished' || !m.score) continue
    const home = tally.get(m.home)
    const away = tally.get(m.away)
    if (!home || !away) continue
    home.conceded += m.score.away
    home.scored += m.score.home
    home.played++
    away.conceded += m.score.home
    away.scored += m.score.away
    away.played++
  }

  const sorted = [...tally.entries()]
    .map(([slug, t]) => ({ slug, ...t }))
    .sort((a, b) => b.conceded - a.conceded || a.scored - b.scored || a.slug.localeCompare(b.slug))

  const top = sorted[0]
  const winners =
    top && top.played > 0
      ? sorted
          .filter((r) => r.conceded === top.conceded)
          .filter((r, _, tied) => r.scored === Math.min(...tied.map((t) => t.scored)))
          .map((r) => r.slug)
      : []

  return {
    rows: sorted.map((r) => ({ ...r, leading: winners.includes(r.slug) })),
    winners,
    final: groupMatches.every((m) => m.status === 'finished'),
  }
}
