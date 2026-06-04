import { describe, expect, it } from 'vitest'
import { computeStandings } from './standings'
import { match, playedGroup, team } from './fixtures'

const teams = ['aaa', 'bbb', 'ccc', 'ddd'].map((s) => team(s))

describe('computeStandings', () => {
  it('computes P/W/D/L/GF/GA/GD/Pts from finished matches only', () => {
    const matches = [
      match({ home: 'aaa', away: 'bbb', score: { home: 2, away: 0 } }),
      match({ home: 'ccc', away: 'ddd', score: { home: 1, away: 1 } }),
      match({ home: 'aaa', away: 'ccc' }), // scheduled — ignored
    ]
    const [groupA] = computeStandings(teams, matches)
    expect(groupA.complete).toBe(false)
    const a = groupA.rows.find((r) => r.slug === 'aaa')!
    expect(a).toMatchObject({ played: 1, won: 1, gf: 2, ga: 0, gd: 2, pts: 3 })
    const c = groupA.rows.find((r) => r.slug === 'ccc')!
    expect(c).toMatchObject({ played: 1, drawn: 1, pts: 1 })
    expect(groupA.rows[0].slug).toBe('aaa')
  })

  it('breaks ties by points, then GD, then GF', () => {
    // bbb and ccc both on 3 pts; bbb GD +1 (2-1), ccc GD +1 (3-2) — GF decides
    const matches = [
      match({ home: 'bbb', away: 'ddd', score: { home: 2, away: 1 } }),
      match({ home: 'ccc', away: 'aaa', score: { home: 3, away: 2 } }),
    ]
    const [groupA] = computeStandings(teams, matches)
    expect(groupA.rows.map((r) => r.slug).slice(0, 2)).toEqual(['ccc', 'bbb'])
  })

  it('marks a group complete when all 6 matches are finished', () => {
    const matches = playedGroup('A', ['aaa', 'bbb', 'ccc', 'ddd'], {
      'aaa-bbb': [1, 0],
      'aaa-ccc': [2, 0],
      'aaa-ddd': [3, 0],
      'bbb-ccc': [1, 1],
      'bbb-ddd': [2, 0],
      'ccc-ddd': [1, 0],
    })
    const [groupA] = computeStandings(teams, matches)
    expect(groupA.complete).toBe(true)
    expect(groupA.rows.map((r) => r.slug)).toEqual(['aaa', 'bbb', 'ccc', 'ddd'])
  })
})
