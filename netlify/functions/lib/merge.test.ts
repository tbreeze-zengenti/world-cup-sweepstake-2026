import { describe, expect, it } from 'vitest'
import { match } from '../../../src/lib/fixtures'
import { mergeMatches } from './merge'
import type { OverlayBlob } from './overlay'

const blob = (overlays: OverlayBlob['overlays']): OverlayBlob => ({
  updatedAt: '2026-06-11T20:00:00Z',
  fixtureMap: {},
  overlays,
})

describe('mergeMatches', () => {
  it('passes static data through unchanged without a blob', () => {
    const matches = [match({ home: 'mexico', away: 'south-africa' })]
    expect(mergeMatches(matches, null)).toBe(matches)
    expect(mergeMatches(matches, undefined)).toBe(matches)
  })

  it('applies status and score, keeping manual fields like cards and venue', () => {
    const m = match({
      id: 'm1',
      home: 'mexico',
      away: 'south-africa',
      venue: 'Mexico City',
      cards: { home: { yellow: 2 }, away: {} },
    })
    const [merged] = mergeMatches(
      [m],
      blob({ m1: { status: 'live', score: { home: 1, away: 0 } } }),
    )
    expect(merged).toEqual({
      ...m,
      status: 'live',
      score: { home: 1, away: 0 },
    })
  })

  it('leaves matches without an overlay untouched', () => {
    const m = match({ id: 'm2', home: 'mexico', away: 'south-africa' })
    expect(mergeMatches([m], blob({}))[0]).toBe(m)
  })

  it('resolves knockout placeholders and applies the shootout', () => {
    const m = match({ id: 'm73', stage: 'r32', group: undefined, home: 'W85', away: 'W86' })
    const [merged] = mergeMatches(
      [m],
      blob({
        m73: {
          status: 'finished',
          score: { home: 1, away: 1 },
          shootout: { home: 4, away: 2 },
          home: 'france',
          away: 'senegal',
        },
      }),
    )
    expect(merged).toMatchObject({
      home: 'france',
      away: 'senegal',
      status: 'finished',
      score: { home: 1, away: 1 },
      shootout: { home: 4, away: 2 },
    })
  })

  it('keeps a manually entered score when the overlay has none yet', () => {
    const m = match({ id: 'm3', home: 'mexico', away: 'south-africa', score: { home: 2, away: 2 } })
    const [merged] = mergeMatches([m], blob({ m3: { status: 'live' } }))
    expect(merged.status).toBe('live')
    expect(merged.score).toEqual({ home: 2, away: 2 })
  })
})
