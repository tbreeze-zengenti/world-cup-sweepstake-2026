import { describe, expect, it } from 'vitest'
import { fdMatch } from './fixtures'
import { toApiFixture } from './footballData'

const slugs = new Set(['mexico', 'south-africa', 'france', 'senegal', 'south-korea'])

describe('toApiFixture', () => {
  it.each([
    ['TIMED', 'NS'], ['SCHEDULED', 'NS'], ['POSTPONED', 'PST'], ['CANCELLED', 'CANC'],
    ['IN_PLAY', 'LIVE'], ['PAUSED', 'HT'], ['SUSPENDED', 'SUSP'],
    ['FINISHED', 'FT'], ['AWARDED', 'AWD'],
  ])('maps status %s → %s', (status, short) => {
    const fx = toApiFixture(fdMatch({ home: 'Mexico', away: 'South Africa', status }), slugs)
    expect(fx.fixture.status.short).toBe(short)
  })

  it('converts utcDate to an epoch-seconds timestamp', () => {
    const fx = toApiFixture(
      fdMatch({ home: 'Mexico', away: 'South Africa', kickoff: '2026-06-11T19:00:00Z' }),
      slugs,
    )
    expect(fx.fixture.timestamp).toBe(Date.parse('2026-06-11T19:00:00Z') / 1000)
  })

  it('carries the live score through fullTime', () => {
    const fx = toApiFixture(
      fdMatch({ home: 'Mexico', away: 'South Africa', status: 'IN_PLAY', fullTime: [1, 0] }),
      slugs,
    )
    expect(fx.goals).toEqual({ home: 1, away: 0 })
  })

  it('marks shootout matches PEN and reports the drawn after-ET score', () => {
    const fx = toApiFixture(
      fdMatch({
        home: 'France', away: 'Senegal',
        status: 'FINISHED', duration: 'PENALTY_SHOOTOUT',
        fullTime: [3, 3], regularTime: [2, 2], extraTime: [1, 1], penalties: [4, 2],
      }),
      slugs,
    )
    expect(fx.fixture.status.short).toBe('PEN')
    expect(fx.goals).toEqual({ home: 3, away: 3 }) // regularTime + extraTime
    expect(fx.score.penalty).toEqual({ home: 4, away: 2 })
  })

  it('falls back to fullTime for shootouts when period scores are missing', () => {
    const fx = toApiFixture(
      fdMatch({
        home: 'France', away: 'Senegal',
        status: 'FINISHED', duration: 'PENALTY_SHOOTOUT',
        fullTime: [1, 1], penalties: [5, 4],
      }),
      slugs,
    )
    expect(fx.goals).toEqual({ home: 1, away: 1 })
  })

  it('prefers whichever of name/shortName resolves to a known slug', () => {
    const m = fdMatch({ home: 'x', away: 'y' })
    m.homeTeam = { name: 'Korea Republic', shortName: 'South Korea' } // both resolve → name
    m.awayTeam = { name: 'Republique francaise', shortName: 'France' } // only shortName resolves
    const fx = toApiFixture(m, slugs)
    expect(fx.teams.home.name).toBe('Korea Republic')
    expect(fx.teams.away.name).toBe('France')
  })

  it('survives null team names on unresolved knockout slots', () => {
    const m = fdMatch({ home: 'x', away: 'y', status: 'TIMED' })
    m.homeTeam = { name: null, shortName: null }
    m.awayTeam = { name: null, shortName: null }
    expect(toApiFixture(m, slugs).teams.home.name).toBe('TBD')
  })
})
