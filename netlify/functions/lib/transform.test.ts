import { describe, expect, it } from 'vitest'
import { match } from '../../../src/lib/fixtures'
import { apiFixture } from './fixtures'
import { fixtureToOverlay, mapStatus } from './transform'

const slugs = new Set(['Mexico', 'South Africa', 'France', 'Senegal'].map((n) => n.toLowerCase().replace(' ', '-')))
const groupMatch = match({ home: 'mexico', away: 'south-africa' })
const koMatch = match({ id: 'm73', stage: 'r32', group: undefined, home: 'W85', away: 'W86' })

describe('mapStatus', () => {
  it.each([
    ['1H', 'live'], ['HT', 'live'], ['2H', 'live'], ['ET', 'live'], ['BT', 'live'],
    ['P', 'live'], ['SUSP', 'live'], ['INT', 'live'], ['LIVE', 'live'],
    ['FT', 'finished'], ['AET', 'finished'], ['PEN', 'finished'], ['AWD', 'finished'], ['WO', 'finished'],
    ['NS', 'scheduled'], ['TBD', 'scheduled'], ['PST', 'scheduled'], ['CANC', 'scheduled'], ['ABD', 'scheduled'],
  ])('%s → %s', (short, status) => {
    expect(mapStatus(short)).toBe(status)
  })
})

describe('fixtureToOverlay', () => {
  it('maps a live group match: score in static orientation, no side overrides', () => {
    const fx = apiFixture({ home: 'Mexico', away: 'South Africa', status: '1H', goals: [1, 0] })
    expect(fixtureToOverlay(fx, groupMatch, slugs)).toEqual({
      status: 'live',
      score: { home: 1, away: 0 },
    })
  })

  it('flips the score when the API reverses a group match orientation', () => {
    const fx = apiFixture({ home: 'South Africa', away: 'Mexico', status: 'FT', goals: [2, 1] })
    expect(fixtureToOverlay(fx, groupMatch, slugs)).toEqual({
      status: 'finished',
      score: { home: 1, away: 2 },
    })
  })

  it('omits the score while goals are null', () => {
    const fx = apiFixture({ home: 'Mexico', away: 'South Africa', status: '1H' })
    expect(fixtureToOverlay(fx, groupMatch, slugs)).toEqual({ status: 'live' })
  })

  it('ignores goals on scheduled fixtures', () => {
    const fx = apiFixture({ home: 'Mexico', away: 'South Africa', status: 'NS', goals: [0, 0] })
    expect(fixtureToOverlay(fx, groupMatch, slugs)).toEqual({ status: 'scheduled' })
  })

  it('adopts the API orientation for knockouts and resolves placeholders', () => {
    const fx = apiFixture({ home: 'France', away: 'Senegal', status: 'FT', goals: [2, 0] })
    expect(fixtureToOverlay(fx, koMatch, slugs)).toEqual({
      status: 'finished',
      score: { home: 2, away: 0 },
      home: 'france',
      away: 'senegal',
    })
  })

  it('records the shootout only on PEN', () => {
    const pen = apiFixture({ home: 'France', away: 'Senegal', status: 'PEN', goals: [1, 1], penalty: [4, 2] })
    expect(fixtureToOverlay(pen, koMatch, slugs)).toMatchObject({
      status: 'finished',
      score: { home: 1, away: 1 },
      shootout: { home: 4, away: 2 },
    })
    const aet = apiFixture({ home: 'France', away: 'Senegal', status: 'AET', goals: [2, 1], penalty: [0, 0] })
    expect(fixtureToOverlay(aet, koMatch, slugs).shootout).toBeUndefined()
  })

  it('leaves sides unset when an API name cannot be resolved', () => {
    const fx = apiFixture({ home: 'Atlantis', away: 'Senegal', status: '1H', goals: [0, 0] })
    expect(fixtureToOverlay(fx, koMatch, slugs)).toEqual({
      status: 'live',
      score: { home: 0, away: 0 },
      away: 'senegal',
    })
  })
})
