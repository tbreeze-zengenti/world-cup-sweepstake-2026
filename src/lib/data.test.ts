import { describe, expect, it } from 'vitest'
import teams from '../../data/teams.json'
import matches from '../../data/matches.json'
import sweepstake from '../../data/sweepstake.json'
import type { Match, Team } from './types'

const teamList = teams as Team[]
const matchList = matches as Match[]
const slugs = new Set(teamList.map((t) => t.slug))

const PLACEHOLDER = /^([12][A-L]|3[A-L](\/[A-L])+|[WL]\d+)$/

describe('data integrity', () => {
  it('has 48 sweepstake entries, 48 teams, bijective by team name', () => {
    expect(sweepstake).toHaveLength(48)
    expect(teamList).toHaveLength(48)
    const sweepstakeTeams = sweepstake.map((e) => e.team).sort()
    const teamNames = teamList.map((t) => t.name).sort()
    expect(sweepstakeTeams).toEqual(teamNames)
    expect(new Set(sweepstakeTeams).size).toBe(48)
  })

  it('has 12 groups of 4 teams with unique slugs and flag codes', () => {
    expect(slugs.size).toBe(48)
    const byGroup = Map.groupBy(teamList, (t) => t.group)
    expect([...byGroup.keys()].sort().join('')).toBe('ABCDEFGHIJKL')
    for (const members of byGroup.values()) expect(members).toHaveLength(4)
    for (const t of teamList) expect(t.iso2).toMatch(/^[a-z]{2}(-[a-z]{3})?$/)
  })

  it('has 104 matches: 6 per group × 12, 32 knockout, unique ids', () => {
    expect(matchList).toHaveLength(104)
    expect(new Set(matchList.map((m) => m.id)).size).toBe(104)
    const group = matchList.filter((m) => m.stage === 'group')
    expect(group).toHaveLength(72)
    const byGroup = Map.groupBy(group, (m) => m.group!)
    for (const ms of byGroup.values()) expect(ms).toHaveLength(6)
    const stages = Map.groupBy(matchList, (m) => m.stage)
    expect(stages.get('r32')).toHaveLength(16)
    expect(stages.get('r16')).toHaveLength(8)
    expect(stages.get('qf')).toHaveLength(4)
    expect(stages.get('sf')).toHaveLength(2)
    expect(stages.get('third')).toHaveLength(1)
    expect(stages.get('final')).toHaveLength(1)
  })

  it('every match side is a valid slug or a resolvable placeholder', () => {
    const ids = new Set(matchList.map((m) => m.id))
    for (const m of matchList) {
      for (const side of [m.home, m.away]) {
        if (slugs.has(side)) continue
        expect(side, `${m.id}: ${side}`).toMatch(PLACEHOLDER)
        const ref = /^[WL](\d+)$/.exec(side)
        if (ref) expect(ids.has(`m${Number(ref[1])}`), `${m.id} references missing m${ref[1]}`).toBe(true)
      }
    }
    // group matches always have real teams and a group letter
    for (const m of matchList.filter((m) => m.stage === 'group')) {
      expect(slugs.has(m.home), `${m.id} home`).toBe(true)
      expect(slugs.has(m.away), `${m.id} away`).toBe(true)
      expect(m.group).toMatch(/^[A-L]$/)
    }
  })

  it('group matches are between teams of the same group', () => {
    const groupOf = new Map(teamList.map((t) => [t.slug, t.group]))
    for (const m of matchList.filter((m) => m.stage === 'group')) {
      expect(groupOf.get(m.home), m.id).toBe(m.group)
      expect(groupOf.get(m.away), m.id).toBe(m.group)
    }
  })

  it('finished matches have scores; scheduled matches have none', () => {
    for (const m of matchList) {
      if (m.status === 'finished') {
        expect(m.score, `${m.id} finished without score`).toBeDefined()
      } else {
        expect(m.status).toBe('scheduled')
        expect(m.score, `${m.id} scheduled with score`).toBeUndefined()
      }
      if (m.shootout) {
        expect(m.stage).not.toBe('group')
        expect(m.score!.home, `${m.id} shootout requires drawn score`).toBe(m.score!.away)
        expect(m.shootout.home, `${m.id} shootout cannot be drawn`).not.toBe(m.shootout.away)
      }
      if (m.cards) expect(m.stage, `${m.id} cards only tracked for group stage`).toBe('group')
    }
  })

  it('all kickoffs are valid ISO dates within the tournament window', () => {
    for (const m of matchList) {
      const d = new Date(m.kickoff)
      expect(d.getTime(), `${m.id} kickoff`).not.toBeNaN()
      expect(d.toISOString() >= '2026-06-11').toBe(true)
      expect(d.toISOString() <= '2026-07-20').toBe(true)
    }
  })
})
