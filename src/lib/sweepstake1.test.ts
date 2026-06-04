import { describe, expect, it } from 'vitest'
import { entrantStatuses } from './sweepstake1'
import { match, playedGroup, team } from './fixtures'
import type { SweepstakeEntry, Team } from './types'

const teams: Team[] = [
  ...['a1', 'a2', 'a3', 'a4'].map((s) => team(s, 'A')),
  ...['b1', 'b2', 'b3', 'b4'].map((s) => team(s, 'B')),
]
const sweepstake: SweepstakeEntry[] = teams.map((t, i) => ({
  // "Pat" holds two teams, like the real two-team holders
  name: i === 0 ? 'Pat' : i === 4 ? 'Pat 2' : `Person ${i}`,
  team: t.name,
  emoji: ':x:',
}))

const groups = [
  ...playedGroup('A', ['a1', 'a2', 'a3', 'a4'], {
    'a1-a2': [1, 0], 'a1-a3': [2, 0], 'a1-a4': [3, 0],
    'a2-a3': [1, 0], 'a2-a4': [2, 0], 'a3-a4': [1, 0],
  }),
  ...playedGroup('B', ['b1', 'b2', 'b3', 'b4'], {
    'b1-b2': [1, 0], 'b1-b3': [2, 0], 'b1-b4': [3, 0],
    'b2-b3': [1, 0], 'b2-b4': [2, 0], 'b3-b4': [1, 0],
  }),
]

describe('entrantStatuses (Sweepstake 1)', () => {
  it('maps every entrant to their team fate, prizes only after the final', () => {
    const finalPending = [
      ...groups,
      match({ id: 'm104', stage: 'final', group: undefined, home: 'a1', away: 'b1' }),
    ]
    const before = entrantStatuses(sweepstake, teams, finalPending)
    expect(before).toHaveLength(8)
    expect(before.every((s) => s.prize === undefined)).toBe(true)
    expect(before.find((s) => s.entry.name === 'Pat')!.fate).toBe('finalist')

    const done = entrantStatuses(sweepstake, teams, [
      ...groups,
      match({ id: 'm104', stage: 'final', group: undefined, home: 'a1', away: 'b1', score: { home: 2, away: 0 } }),
    ])
    const champion = done.find((s) => s.fate === 'champion')!
    const runnerUp = done.find((s) => s.fate === 'runner-up')!
    expect(champion.entry.name).toBe('Pat')
    expect(champion.prize).toBe(96)
    expect(runnerUp.entry.name).toBe('Pat 2')
    expect(runnerUp.prize).toBe(48)
    // champions sort first
    expect(done[0].fate).toBe('champion')
  })

  it('throws on a sweepstake team that maps to no API team', () => {
    expect(() =>
      entrantStatuses([{ name: 'X', team: 'Narnia', emoji: ':x:' }], teams, []),
    ).toThrow(/Narnia/)
  })
})
