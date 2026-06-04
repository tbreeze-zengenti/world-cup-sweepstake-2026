import { describe, expect, it } from 'vitest'
import { buildContext, computeFates, matchWinner, resolveSide } from './bracket'
import { match, playedGroup, team } from './fixtures'
import type { Match, Team } from './types'

// Two complete groups feeding a four-team knockout.
const teams: Team[] = [
  ...['a1', 'a2', 'a3', 'a4'].map((s) => team(s, 'A')),
  ...['b1', 'b2', 'b3', 'b4'].map((s) => team(s, 'B')),
]

const groupResults = (group: string, slugs: [string, string, string, string]) =>
  // slugs[0] wins all, slugs[1] second, slugs[2] third, slugs[3] last
  playedGroup(group, slugs, {
    [`${slugs[0]}-${slugs[1]}`]: [1, 0],
    [`${slugs[0]}-${slugs[2]}`]: [2, 0],
    [`${slugs[0]}-${slugs[3]}`]: [3, 0],
    [`${slugs[1]}-${slugs[2]}`]: [1, 0],
    [`${slugs[1]}-${slugs[3]}`]: [2, 0],
    [`${slugs[2]}-${slugs[3]}`]: [1, 0],
  })

describe('resolveSide', () => {
  it('passes slugs through and labels unknown groups', () => {
    const ctx = buildContext(teams, [])
    expect(resolveSide('a1', ctx).slug).toBe('a1')
    expect(resolveSide('1A', ctx)).toEqual({ label: 'Group A winner' })
    expect(resolveSide('3A/B/C/D', ctx).label).toBe('Best 3rd (A/B/C/D)')
  })

  it('resolves 1A/2A once the group completes', () => {
    const ctx = buildContext(teams, groupResults('A', ['a1', 'a2', 'a3', 'a4']))
    expect(resolveSide('1A', ctx).slug).toBe('a1')
    expect(resolveSide('2A', ctx).slug).toBe('a2')
    expect(resolveSide('1B', ctx).slug).toBeUndefined()
  })

  it('resolves W/L refs from finished matches, including shootouts', () => {
    const sf: Match = match({
      id: 'm101',
      stage: 'sf',
      group: undefined,
      home: 'a1',
      away: 'b1',
      score: { home: 1, away: 1 },
      shootout: { home: 3, away: 4 },
    })
    const ctx = buildContext(teams, [sf])
    expect(matchWinner(sf, ctx)).toBe('b1')
    expect(resolveSide('W101', ctx).slug).toBe('b1')
    expect(resolveSide('L101', ctx).slug).toBe('a1')
    expect(resolveSide('W102', ctx)).toEqual({ label: 'Winner M102' })
  })

  it('resolves W refs through placeholder sides (e.g. finished "1A vs 2B" match)', () => {
    const matches = [
      ...groupResults('A', ['a1', 'a2', 'a3', 'a4']),
      ...groupResults('B', ['b1', 'b2', 'b3', 'b4']),
      match({ id: 'm73', stage: 'r32', group: undefined, home: '1A', away: '2B', score: { home: 0, away: 2 } }),
    ]
    const ctx = buildContext(teams, matches)
    expect(resolveSide('W73', ctx).slug).toBe('b2')
  })
})

describe('computeFates', () => {
  const bothGroups = [
    ...groupResults('A', ['a1', 'a2', 'a3', 'a4']),
    ...groupResults('B', ['b1', 'b2', 'b3', 'b4']),
  ]

  it('keeps everyone alive while groups are in play', () => {
    const fates = computeFates(teams, [bothGroups[0]])
    expect([...fates.values()].every((f) => f === 'alive')).toBe(true)
  })

  it('eliminates 4th, puts 3rd in limbo until all groups finish', () => {
    const oneGroup = groupResults('A', ['a1', 'a2', 'a3', 'a4'])
    // Group B not started → thirds ranking not final
    const incomplete = computeFates(teams, [...oneGroup, match({ group: 'B', home: 'b1', away: 'b2' })])
    expect(incomplete.get('a4')).toBe('eliminated')
    expect(incomplete.get('a3')).toBe('limbo')
    expect(incomplete.get('a1')).toBe('alive')
    // All groups done → both thirds rank in top 8 (only 2 thirds here)
    const complete = computeFates(teams, bothGroups)
    expect(complete.get('a3')).toBe('alive')
    expect(complete.get('b3')).toBe('alive')
  })

  it('eliminates knockout losers including semi-final losers', () => {
    const matches = [
      ...bothGroups,
      match({ id: 'm101', stage: 'sf', group: undefined, home: 'a1', away: 'b1', score: { home: 0, away: 1 } }),
    ]
    const fates = computeFates(teams, matches)
    expect(fates.get('a1')).toBe('eliminated')
    expect(fates.get('b1')).toBe('alive')
  })

  it('marks finalists, then champion and runner-up; third-place match changes nothing', () => {
    const sf1 = match({ id: 'm101', stage: 'sf', group: undefined, home: 'a1', away: 'b2', score: { home: 1, away: 0 } })
    const sf2 = match({ id: 'm102', stage: 'sf', group: undefined, home: 'b1', away: 'a2', score: { home: 2, away: 0 } })
    const pending = [
      ...bothGroups, sf1, sf2,
      match({ id: 'm103', stage: 'third', group: undefined, home: 'L101', away: 'L102' }),
      match({ id: 'm104', stage: 'final', group: undefined, home: 'W101', away: 'W102' }),
    ]
    const before = computeFates(teams, pending)
    expect(before.get('a1')).toBe('finalist')
    expect(before.get('b1')).toBe('finalist')
    expect(before.get('b2')).toBe('eliminated')

    const played = pending.map((m) =>
      m.id === 'm103'
        ? { ...m, status: 'finished' as const, score: { home: 3, away: 0 } }
        : m.id === 'm104'
          ? { ...m, status: 'finished' as const, score: { home: 1, away: 1 }, shootout: { home: 5, away: 4 } }
          : m,
    )
    const after = computeFates(teams, played)
    expect(after.get('a1')).toBe('champion') // shootout winner via W101
    expect(after.get('b1')).toBe('runner-up')
    expect(after.get('b2')).toBe('eliminated') // won third place, fate unchanged
  })
})
