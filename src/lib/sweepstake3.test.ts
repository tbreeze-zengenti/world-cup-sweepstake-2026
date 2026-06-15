import { describe, expect, it } from 'vitest'
import { cardPoints, rankDiscipline } from './sweepstake3'
import { match, team } from './fixtures'

const teams = ['aaa', 'bbb', 'ccc', 'ddd'].map((s) => team(s))

describe('cardPoints', () => {
  it('scores 1 per yellow, 3 per red; second yellows do not count', () => {
    expect(cardPoints({ yellow: 2 })).toBe(2)
    expect(cardPoints({ red: 1 })).toBe(3)
    expect(cardPoints({ secondYellow: 1 })).toBe(0)
    expect(cardPoints({ yellow: 3, red: 1, secondYellow: 1 })).toBe(6)
    expect(cardPoints({})).toBe(0)
  })
})

describe('rankDiscipline (Sweepstake 3)', () => {
  it('tallies group-stage cards and flags finished matches missing card data', () => {
    const result = rankDiscipline(teams, [
      match({
        home: 'aaa', away: 'bbb', score: { home: 1, away: 0 },
        cards: { home: { yellow: 2 }, away: { yellow: 1, red: 1 } },
      }),
      match({ id: 'mX', home: 'ccc', away: 'ddd', score: { home: 0, away: 0 } }), // no cards recorded
    ])
    expect(result.rows[0]).toMatchObject({ slug: 'bbb', points: 4 })
    expect(result.winners).toEqual(['bbb'])
    expect(result.missingCards).toEqual(['mX'])
    expect(result.final).toBe(false)
  })

  it('breaks a points tie by most reds, then fewest goals scored', () => {
    // aaa: 3 yellows (3 pts, 0 reds); bbb: 1 red (3 pts, 1 red) → bbb wins
    const result = rankDiscipline(teams, [
      match({
        home: 'aaa', away: 'bbb', score: { home: 2, away: 2 },
        cards: { home: { yellow: 3 }, away: { red: 1 } },
      }),
    ])
    expect(result.winners).toEqual(['bbb'])

    // points and reds tied → fewest scored: ccc scored 0, ddd scored 1 → ccc
    const result2 = rankDiscipline(teams, [
      match({
        home: 'ccc', away: 'ddd', score: { home: 0, away: 1 },
        cards: { home: { yellow: 1 }, away: { yellow: 1 } },
      }),
    ])
    expect(result2.winners).toEqual(['ccc'])
  })

  it('splits when fully tied', () => {
    const result = rankDiscipline(teams, [
      match({
        home: 'aaa', away: 'bbb', score: { home: 1, away: 1 },
        cards: { home: { yellow: 2 }, away: { yellow: 2 } },
      }),
    ])
    expect(result.winners.sort()).toEqual(['aaa', 'bbb'])
  })

  it('ignores knockout cards and declares no winner with zero points', () => {
    const result = rankDiscipline(teams, [
      match({ home: 'aaa', away: 'bbb', score: { home: 0, away: 0 }, cards: { home: {}, away: {} } }),
    ])
    expect(result.winners).toEqual([])
  })
})
