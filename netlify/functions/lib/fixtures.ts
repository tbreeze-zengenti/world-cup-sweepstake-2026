// Test fixture builders — used by *.test.ts only.
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
