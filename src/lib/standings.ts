import type { Match, Team } from './types'

export interface StandingRow {
  slug: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  pts: number
}

export interface GroupStanding {
  group: string
  rows: StandingRow[]
  /** true when all 6 group matches are finished */
  complete: boolean
}

/**
 * Tiebreak: points → goal difference → goals scored → name (stable).
 * (FIFA continues with head-to-head among tied teams, then discipline,
 * then drawing of lots — rare; organiser can verify against the official
 * table if a group ever ties that deep.)
 */
export function compareRows(a: StandingRow, b: StandingRow): number {
  return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.slug.localeCompare(b.slug)
}

export function computeStandings(teams: Team[], matches: Match[]): GroupStanding[] {
  const rows = new Map<string, StandingRow>()
  for (const t of teams) {
    rows.set(t.slug, { slug: t.slug, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 })
  }

  const groupMatches = matches.filter((m) => m.stage === 'group')
  for (const m of groupMatches) {
    if (m.status !== 'finished' || !m.score) continue
    const home = rows.get(m.home)
    const away = rows.get(m.away)
    if (!home || !away) continue
    home.played++
    away.played++
    home.gf += m.score.home
    home.ga += m.score.away
    away.gf += m.score.away
    away.ga += m.score.home
    if (m.score.home > m.score.away) {
      home.won++
      away.lost++
      home.pts += 3
    } else if (m.score.home < m.score.away) {
      away.won++
      home.lost++
      away.pts += 3
    } else {
      home.drawn++
      away.drawn++
      home.pts++
      away.pts++
    }
  }
  for (const r of rows.values()) r.gd = r.gf - r.ga

  const groups = [...new Set(teams.map((t) => t.group))].sort()
  return groups.map((group) => {
    const slugs = teams.filter((t) => t.group === group).map((t) => t.slug)
    const groupRows = slugs.map((s) => rows.get(s)!).sort(compareRows)
    const ms = groupMatches.filter((m) => m.group === group)
    const complete = ms.length === 6 && ms.every((m) => m.status === 'finished')
    return { group, rows: groupRows, complete }
  })
}
