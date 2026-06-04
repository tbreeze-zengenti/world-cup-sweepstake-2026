// Test fixture builders — used by *.test.ts only.
import type { Match, Stage, Team } from './types'

export const team = (slug: string, group = 'A'): Team => ({
  slug,
  name: slug,
  iso2: 'xx',
  group,
})

let seq = 0
export const resetIds = () => (seq = 0)

export const match = (over: Partial<Match> & Pick<Match, 'home' | 'away'>): Match => ({
  id: over.id ?? `m${++seq}`,
  stage: 'group' as Stage,
  group: 'A',
  kickoff: '2026-06-11T12:00:00Z',
  status: over.score ? 'finished' : 'scheduled',
  ...over,
})

/** All 6 finished round-robin matches for a group of 4, given each pairing's score. */
export const playedGroup = (
  group: string,
  slugs: [string, string, string, string],
  scores: Record<string, [number, number]>,
): Match[] => {
  const out: Match[] = []
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const key = `${slugs[i]}-${slugs[j]}`
      const score = scores[key]
      if (!score) throw new Error(`Missing score for ${key}`)
      out.push(
        match({ group, home: slugs[i], away: slugs[j], score: { home: score[0], away: score[1] } }),
      )
    }
  }
  return out
}
