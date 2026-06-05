// Test fixture builders — used by *.test.ts only.
import type { FdMatch } from './footballData'
import type { ApiFixture } from './overlay'

let seq = 1000
export const resetApiIds = () => (seq = 1000)

export const apiFixture = (over: {
  id?: number
  /** ISO kickoff — converted to the API's epoch-seconds timestamp. */
  kickoff?: string
  status?: string
  home: string
  away: string
  goals?: [number, number]
  penalty?: [number, number]
}): ApiFixture => ({
  fixture: {
    id: over.id ?? ++seq,
    timestamp: Math.floor(new Date(over.kickoff ?? '2026-06-11T12:00:00Z').getTime() / 1000),
    status: { short: over.status ?? 'NS' },
  },
  teams: { home: { name: over.home }, away: { name: over.away } },
  goals: over.goals
    ? { home: over.goals[0], away: over.goals[1] }
    : { home: null, away: null },
  score: {
    penalty: over.penalty
      ? { home: over.penalty[0], away: over.penalty[1] }
      : { home: null, away: null },
  },
})

export const fdMatch = (over: {
  id?: number
  kickoff?: string
  status?: string
  home: string
  away: string
  duration?: string
  fullTime?: [number, number]
  regularTime?: [number, number]
  extraTime?: [number, number]
  penalties?: [number, number]
}): FdMatch => {
  const pair = (p?: [number, number]) =>
    p ? { home: p[0], away: p[1] } : { home: null, away: null }
  return {
    id: over.id ?? ++seq,
    utcDate: over.kickoff ?? '2026-06-11T19:00:00Z',
    status: over.status ?? 'TIMED',
    homeTeam: { name: over.home, shortName: over.home },
    awayTeam: { name: over.away, shortName: over.away },
    score: {
      duration: over.duration ?? 'REGULAR',
      fullTime: pair(over.fullTime),
      ...(over.regularTime && { regularTime: pair(over.regularTime) }),
      ...(over.extraTime && { extraTime: pair(over.extraTime) }),
      ...(over.penalties && { penalties: pair(over.penalties) }),
    },
  }
}
