import type { CardCounts, Match, Team } from './types'

export interface DisciplineRow {
  slug: string
  yellow: number
  red: number
  secondYellow: number
  points: number
  /** goals scored in the group stage (final tiebreak) */
  scored: number
  leading: boolean
}

export interface DisciplineResult {
  rows: DisciplineRow[]
  winners: string[]
  final: boolean
  /** finished group matches with no cards recorded yet */
  missingCards: string[]
}

/**
 * Sweepstake 3 (£48): worst disciplinary record in the group stage.
 * Points: 1 per yellow, 3 per red, 4 per second-yellow send-off (the
 * player's first yellow + the red — recorded as `secondYellow` only).
 * Tiebreak (organiser default, D2): most points → most reds (incl.
 * second-yellow send-offs) → fewest goals scored → split.
 */
export const cardPoints = (c: CardCounts): number =>
  (c.yellow ?? 0) + 3 * (c.red ?? 0) + 4 * (c.secondYellow ?? 0)

export function rankDiscipline(teams: Team[], matches: Match[]): DisciplineResult {
  const tally = new Map<string, Omit<DisciplineRow, 'slug' | 'leading'>>(
    teams.map((t) => [t.slug, { yellow: 0, red: 0, secondYellow: 0, points: 0, scored: 0 }]),
  )
  const missingCards: string[] = []
  const groupMatches = matches.filter((m) => m.stage === 'group')

  for (const m of groupMatches) {
    if (m.status !== 'finished') continue
    if (!m.cards) {
      missingCards.push(m.id)
      continue
    }
    for (const side of ['home', 'away'] as const) {
      const t = tally.get(m[side])
      if (!t) continue
      const c = m.cards[side] ?? {}
      t.yellow += c.yellow ?? 0
      t.red += c.red ?? 0
      t.secondYellow += c.secondYellow ?? 0
      t.points += cardPoints(c)
    }
  }
  for (const m of groupMatches) {
    if (m.status !== 'finished' || !m.score) continue
    const home = tally.get(m.home)
    const away = tally.get(m.away)
    if (home) home.scored += m.score.home
    if (away) away.scored += m.score.away
  }

  const reds = (r: { red: number; secondYellow: number }) => r.red + r.secondYellow
  const sorted = [...tally.entries()]
    .map(([slug, t]) => ({ slug, ...t }))
    .sort(
      (a, b) =>
        b.points - a.points || reds(b) - reds(a) || a.scored - b.scored || a.slug.localeCompare(b.slug),
    )

  const top = sorted[0]
  let winners: string[] = []
  if (top && top.points > 0) {
    const tiedPoints = sorted.filter((r) => r.points === top.points)
    const maxReds = Math.max(...tiedPoints.map(reds))
    const tiedReds = tiedPoints.filter((r) => reds(r) === maxReds)
    const minScored = Math.min(...tiedReds.map((r) => r.scored))
    winners = tiedReds.filter((r) => r.scored === minScored).map((r) => r.slug)
  }

  return {
    rows: sorted.map((r) => ({ ...r, leading: winners.includes(r.slug) })),
    winners,
    final: groupMatches.every((m) => m.status === 'finished') && missingCards.length === 0,
    missingCards,
  }
}
