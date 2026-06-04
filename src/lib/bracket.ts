import type { Match, Team } from './types'
import { computeStandings, type GroupStanding } from './standings'
import { rankThirdPlace } from './thirdPlace'

export type Fate = 'alive' | 'limbo' | 'eliminated' | 'finalist' | 'champion' | 'runner-up'

export interface ResolvedSide {
  /** team slug when known */
  slug?: string
  /** human-readable label when not yet known */
  label: string
}

export interface BracketContext {
  teamSlugs: Set<string>
  standingsByGroup: Map<string, GroupStanding>
  matchesById: Map<string, Match>
}

export function buildContext(teams: Team[], matches: Match[]): BracketContext {
  const standings = computeStandings(teams, matches)
  return {
    teamSlugs: new Set(teams.map((t) => t.slug)),
    standingsByGroup: new Map(standings.map((g) => [g.group, g])),
    matchesById: new Map(matches.map((m) => [m.id, m])),
  }
}

const GROUP_POS = /^([12])([A-L])$/
const BEST_THIRD = /^3[A-L](\/[A-L])+$/
const MATCH_REF = /^([WL])(\d+)$/

/**
 * Resolve a match side: a slug stays a slug; "1A"/"2A" resolve once the
 * group is complete; "W73"/"L73" resolve once match 73 is finished;
 * "3A/B/C/D/F" never auto-resolves (FIFA's allocation table for best
 * thirds — the organiser pins the actual slug into matches.json).
 */
export function resolveSide(raw: string, ctx: BracketContext): ResolvedSide {
  if (ctx.teamSlugs.has(raw)) return { slug: raw, label: raw }

  const pos = GROUP_POS.exec(raw)
  if (pos) {
    const [, place, group] = pos
    const standing = ctx.standingsByGroup.get(group)
    const label = place === '1' ? `Group ${group} winner` : `Group ${group} runner-up`
    if (standing?.complete) {
      const row = standing.rows[Number(place) - 1]
      if (row) return { slug: row.slug, label }
    }
    return { label }
  }

  if (BEST_THIRD.test(raw)) return { label: `Best 3rd (${raw.slice(1)})` }

  const ref = MATCH_REF.exec(raw)
  if (ref) {
    const [, kind, num] = ref
    const match = ctx.matchesById.get(`m${Number(num)}`)
    const label = `${kind === 'W' ? 'Winner' : 'Loser'} M${num}`
    if (match && match.status === 'finished') {
      const winner = matchWinner(match, ctx)
      const loser = matchLoser(match, ctx)
      const slug = kind === 'W' ? winner : loser
      if (slug) return { slug, label }
    }
    return { label }
  }

  return { label: raw }
}

function decideSides(match: Match): { winner?: 'home' | 'away' } {
  if (match.status !== 'finished' || !match.score) return {}
  if (match.shootout) {
    return { winner: match.shootout.home > match.shootout.away ? 'home' : 'away' }
  }
  if (match.score.home === match.score.away) return {} // group draw
  return { winner: match.score.home > match.score.away ? 'home' : 'away' }
}

export function matchWinner(match: Match, ctx: BracketContext): string | undefined {
  const { winner } = decideSides(match)
  if (!winner) return undefined
  return resolveSide(match[winner], ctx).slug
}

export function matchLoser(match: Match, ctx: BracketContext): string | undefined {
  const { winner } = decideSides(match)
  if (!winner) return undefined
  return resolveSide(winner === 'home' ? match.away : match.home, ctx).slug
}

/**
 * Sweepstake-1 fate for every team.
 *
 * - Group stage: 4th in a complete group is out; 3rd is in "limbo" until
 *   all groups finish, then the best-thirds top 8 survive.
 * - Knockout: losing any of R32–SF eliminates you (an SF loser still plays
 *   the third-place match, but can no longer be champion or runner-up).
 * - Final: winner = champion, loser = runner-up; both "finalist" before.
 */
export function computeFates(teams: Team[], matches: Match[]): Map<string, Fate> {
  const ctx = buildContext(teams, matches)
  const fates = new Map<string, Fate>(teams.map((t) => [t.slug, 'alive' as Fate]))
  const standings = [...ctx.standingsByGroup.values()]

  // Group-stage eliminations
  const thirds = rankThirdPlace(standings)
  for (const g of standings) {
    if (!g.complete) continue
    const fourth = g.rows[3]
    if (fourth) fates.set(fourth.slug, 'eliminated')
    const third = g.rows[2]
    if (third) {
      if (!thirds.final) fates.set(third.slug, 'limbo')
      else {
        const ranked = thirds.rows.find((r) => r.slug === third.slug)
        fates.set(third.slug, ranked?.qualifies ? 'alive' : 'eliminated')
      }
    }
  }

  // Knockout eliminations (third-place match never changes a fate)
  for (const m of matches) {
    if (m.stage === 'group' || m.stage === 'third' || m.status !== 'finished') continue
    const loser = matchLoser(m, ctx)
    const winner = matchWinner(m, ctx)
    if (m.stage === 'final') {
      if (winner) fates.set(winner, 'champion')
      if (loser) fates.set(loser, 'runner-up')
    } else if (loser) {
      fates.set(loser, 'eliminated')
    }
  }

  // Finalists (final known but not yet played)
  const final = matches.find((m) => m.stage === 'final')
  if (final && final.status !== 'finished') {
    for (const raw of [final.home, final.away]) {
      const side = resolveSide(raw, ctx)
      if (side.slug && fates.get(side.slug) === 'alive') fates.set(side.slug, 'finalist')
    }
  }

  return fates
}
