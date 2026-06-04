export type Stage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final'

export interface Team {
  slug: string
  name: string
  /** flag-icons css code; England/Scotland use GB subdivision codes */
  iso2: string
  group: string
}

export interface SweepstakeEntry {
  /** Display verbatim — one entrant name contains a Slack emoji code */
  name: string
  team: string
  emoji: string
}

export interface CardCounts {
  /** standalone yellows (not part of a send-off) — 1 pt each */
  yellow?: number
  /** direct reds — 3 pts each */
  red?: number
  /** players sent off for a second yellow — 4 pts each (1 + 3) */
  secondYellow?: number
}

export interface Match {
  id: string
  stage: Stage
  group?: string
  kickoff: string
  venue?: string
  /**
   * Team slug, or an unresolved placeholder:
   *  - "1A" / "2A"        group winner / runner-up
   *  - "3A/B/C/D/F"       best third-placed team from one of those groups
   *  - "W73" / "L101"     winner / loser of match number 73 / 101
   */
  home: string
  away: string
  status: 'scheduled' | 'finished'
  /** Full-time score (after extra time in knockouts). Required when finished. */
  score?: { home: number; away: number }
  /** Penalty shootout — knockout only; decides the winner when present. */
  shootout?: { home: number; away: number }
  /** Group stage only (all Sweepstake 3 needs). */
  cards?: { home: CardCounts; away: CardCounts }
}

export interface TournamentData {
  teams: Team[]
  matches: Match[]
  sweepstake: SweepstakeEntry[]
}
