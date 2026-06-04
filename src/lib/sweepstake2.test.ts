import { describe, expect, it } from 'vitest'
import { rankConceded } from './sweepstake2'
import { match, team } from './fixtures'

const teams = ['aaa', 'bbb', 'ccc', 'ddd'].map((s) => team(s))

describe('rankConceded (Sweepstake 2)', () => {
  it('ranks by most conceded, counting finished group matches only', () => {
    const result = rankConceded(teams, [
      match({ home: 'aaa', away: 'bbb', score: { home: 4, away: 1 } }),
      match({ home: 'ccc', away: 'ddd', score: { home: 0, away: 2 } }),
      match({ home: 'aaa', away: 'ccc' }), // scheduled — ignored
      match({ id: 'm99', stage: 'r32', group: undefined, home: 'aaa', away: 'ccc', score: { home: 9, away: 0 } }), // knockout — ignored
    ])
    expect(result.rows[0].slug).toBe('bbb')
    expect(result.rows[0].conceded).toBe(4)
    expect(result.winners).toEqual(['bbb'])
    expect(result.final).toBe(false)
  })

  it('breaks a conceded tie by fewest goals scored', () => {
    // bbb and ccc both concede 3; bbb scored 0, ccc scored 2 → bbb wins
    const result = rankConceded(teams, [
      match({ home: 'aaa', away: 'bbb', score: { home: 3, away: 0 } }),
      match({ home: 'ddd', away: 'ccc', score: { home: 3, away: 2 } }),
    ])
    expect(result.winners).toEqual(['bbb'])
    expect(result.rows.map((r) => r.slug).slice(0, 2)).toEqual(['bbb', 'ccc'])
  })

  it('splits when tied on conceded AND scored', () => {
    const result = rankConceded(teams, [
      match({ home: 'aaa', away: 'bbb', score: { home: 3, away: 1 } }),
      match({ home: 'ddd', away: 'ccc', score: { home: 3, away: 1 } }),
    ])
    expect(result.winners.sort()).toEqual(['bbb', 'ccc'])
    expect(result.rows.filter((r) => r.leading)).toHaveLength(2)
  })

  it('declares no winner before any match is played', () => {
    expect(rankConceded(teams, [match({ home: 'aaa', away: 'bbb' })]).winners).toEqual([])
  })
})
