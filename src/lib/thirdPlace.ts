import { compareRows, type GroupStanding, type StandingRow } from './standings'

export interface ThirdPlaceRow extends StandingRow {
  group: string
  /** in the top 8 of the current ranking */
  qualifies: boolean
}

/**
 * Ranking of the 12 third-placed teams — the best 8 advance to the
 * Round of 32. Same tiebreak simplification as group standings.
 */
export function rankThirdPlace(standings: GroupStanding[]): {
  rows: ThirdPlaceRow[]
  /** all 72 group matches finished — ranking is final */
  final: boolean
} {
  const thirds = standings
    .filter((g) => g.rows.length >= 3)
    .map((g) => ({ ...g.rows[2], group: g.group }))
    .sort(compareRows)
  return {
    rows: thirds.map((r, i) => ({ ...r, qualifies: i < 8 })),
    final: standings.every((g) => g.complete),
  }
}
