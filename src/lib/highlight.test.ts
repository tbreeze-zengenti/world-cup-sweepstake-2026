import { describe, expect, it } from 'vitest'
import { highlightSlugs, personOptions } from './highlight'
import type { SweepstakeEntry, Team } from './types'

const teams: Team[] = [
  { slug: 'ecuador', name: 'Ecuador', iso2: 'ec', group: 'A' },
  { slug: 'ghana', name: 'Ghana', iso2: 'gh', group: 'B' },
  { slug: 'scotland', name: 'Scotland', iso2: 'gb-sct', group: 'C' },
]

const sweepstake: SweepstakeEntry[] = [
  { name: 'Al Roberts', team: 'Ecuador', emoji: ':flag-ec:' },
  { name: 'Al Roberts 2', team: 'Ghana', emoji: ':flag-gh:' },
  { name: 'Ben Horan', team: 'Scotland', emoji: ':flag-sct:' },
]

describe('personOptions', () => {
  it('de-dupes "X 2" entries and sorts', () => {
    expect(personOptions(sweepstake)).toEqual(['Al Roberts', 'Ben Horan'])
  })
})

describe('highlightSlugs', () => {
  it('returns all teams for a person with two entries', () => {
    const slugs = highlightSlugs({ kind: 'person', name: 'Al Roberts' }, sweepstake, teams)
    expect(slugs).toEqual(new Set(['ecuador', 'ghana']))
  })

  it('returns the single team for a one-entry person', () => {
    const slugs = highlightSlugs({ kind: 'person', name: 'Ben Horan' }, sweepstake, teams)
    expect(slugs).toEqual(new Set(['scotland']))
  })

  it('returns just the selected slug for a country', () => {
    const slugs = highlightSlugs({ kind: 'country', slug: 'scotland' }, sweepstake, teams)
    expect(slugs).toEqual(new Set(['scotland']))
  })

  it('returns empty for none and for unknown people', () => {
    expect(highlightSlugs({ kind: 'none' }, sweepstake, teams).size).toBe(0)
    expect(highlightSlugs({ kind: 'person', name: 'Nobody' }, sweepstake, teams).size).toBe(0)
  })

  it('skips entries whose team is missing from teams.json', () => {
    const extra = [...sweepstake, { name: 'Al Roberts 2', team: 'Atlantis', emoji: ':x:' }]
    const slugs = highlightSlugs({ kind: 'person', name: 'Al Roberts' }, extra, teams)
    expect(slugs).toEqual(new Set(['ecuador', 'ghana']))
  })
})
