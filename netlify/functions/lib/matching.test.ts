import { describe, expect, it, vi } from 'vitest'
import { match } from '../../../src/lib/fixtures'
import { apiFixture } from './fixtures'
import { matchFixtures } from './matching'

const slugs = new Set(['mexico', 'south-africa', 'czechia', 'south-korea', 'france', 'senegal'])

// Two simultaneous final-round group games plus two knockout slots.
const SLOT = '2026-06-24T12:00:00-07:00'
const matches = [
  match({ id: 'm49', home: 'mexico', away: 'south-africa', kickoff: SLOT }),
  match({ id: 'm50', home: 'czechia', away: 'south-korea', kickoff: SLOT }),
  match({ id: 'm73', stage: 'r32', group: undefined, home: 'W85', away: 'W86', kickoff: '2026-06-28T12:00:00Z' }),
  match({ id: 'm74', stage: 'r32', group: undefined, home: '1A', away: '2B', kickoff: '2026-06-28T16:00:00Z' }),
]

describe('matchFixtures', () => {
  it('binds simultaneous group matches by team pair, either orientation', () => {
    const map = matchFixtures(
      [
        apiFixture({ id: 1, home: 'South Africa', away: 'Mexico', kickoff: SLOT }),
        apiFixture({ id: 2, home: 'Czech Republic', away: 'Korea Republic', kickoff: SLOT }),
      ],
      matches,
      slugs,
      {},
    )
    expect(map).toEqual({ '1': 'm49', '2': 'm50' })
  })

  it('binds knockouts by kickoff time even when teams are unknown', () => {
    const map = matchFixtures(
      [apiFixture({ id: 3, home: 'TBD', away: 'TBD', kickoff: '2026-06-28T12:00:00Z' })],
      matches,
      slugs,
      {},
    )
    expect(map).toEqual({ '3': 'm73' })
  })

  it('does not rebind a group pairing to a knockout rematch weeks later', () => {
    const map = matchFixtures(
      [apiFixture({ id: 4, home: 'Mexico', away: 'South Africa', kickoff: '2026-06-28T16:00:00Z' })],
      matches,
      slugs,
      {},
    )
    expect(map).toEqual({ '4': 'm74' }) // bound to the knockout slot by time
  })

  it('keeps prior bindings sticky and never double-binds a match', () => {
    const prior = { '1': 'm49' }
    const map = matchFixtures(
      [
        apiFixture({ id: 1, home: 'Mexico', away: 'South Africa', kickoff: SLOT }),
        // wrong duplicate claiming the already-bound m49 pairing
        apiFixture({ id: 9, home: 'Mexico', away: 'South Africa', kickoff: SLOT }),
      ],
      matches,
      slugs,
      prior,
    )
    expect(map['1']).toBe('m49')
    expect(map['9']).toBeUndefined()
    expect(prior).toEqual({ '1': 'm49' }) // input not mutated
  })

  it('skips and warns when a kickoff time is ambiguous between knockouts', () => {
    const warn = vi.fn()
    const close = [
      match({ id: 'k1', stage: 'r16', group: undefined, home: 'W1', away: 'W2', kickoff: '2026-07-04T12:00:00Z' }),
      match({ id: 'k2', stage: 'r16', group: undefined, home: 'W3', away: 'W4', kickoff: '2026-07-04T13:00:00Z' }),
    ]
    const map = matchFixtures(
      [apiFixture({ id: 5, home: 'TBD', away: 'TBD', kickoff: '2026-07-04T12:30:00Z' })],
      close,
      slugs,
      {},
      warn,
    )
    expect(map).toEqual({})
    expect(warn).toHaveBeenCalledOnce()
  })
})
