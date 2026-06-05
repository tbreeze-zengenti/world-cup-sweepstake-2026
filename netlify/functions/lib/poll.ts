import type { Match } from '../../../src/lib/types'
import { matchFixtures } from './matching'
import { fixtureToOverlay, mapStatus } from './transform'
import type { ApiFixture, MatchOverlay, OverlayBlob } from './overlay'

/** Kickoff → kickoff + 3.5h covers half-time, extra time and a shootout. */
const WINDOW_MS = 3.5 * 60 * 60 * 1000

export const API_URL = 'https://v3.football.api-sports.io/fixtures?league=1&season=2026'

/** True while any match could be in play — the gate for API requests. */
export const inActiveWindow = (matches: Match[], now: number): boolean =>
  matches.some((m) => {
    const k = new Date(m.kickoff).getTime()
    return now >= k && now <= k + WINDOW_MS
  })

export interface PollResult {
  /** New blob to store; absent when there is nothing to write. */
  blob?: OverlayBlob
  note: string
}

/**
 * One poll cycle, dependency-injected for tests. Any API failure returns
 * without a blob so the previously stored overlay keeps being served.
 */
export async function runPoll({
  fetchFn,
  apiKey,
  now,
  matches,
  validSlugs,
  prior,
  log = console.log,
  apiUrl = API_URL,
}: {
  fetchFn: typeof fetch
  apiKey: string | undefined
  now: number
  matches: Match[]
  validSlugs: ReadonlySet<string>
  prior: OverlayBlob | null
  log?: (msg: string) => void
  apiUrl?: string
}): Promise<PollResult> {
  if (!inActiveWindow(matches, now)) return { note: 'no active match window' }
  if (!apiKey) throw new Error('API_FOOTBALL_KEY is not set')

  const res = await fetchFn(apiUrl, { headers: { 'x-apisports-key': apiKey } })
  log(
    `api-football ${res.status}; requests remaining today: ` +
      `${res.headers.get('x-ratelimit-requests-remaining')}, this minute: ` +
      `${res.headers.get('X-RateLimit-Remaining')}`,
  )
  if (!res.ok) return { note: `API error ${res.status}; keeping previous overlay` }

  const body = (await res.json()) as { errors?: object; response?: ApiFixture[] }
  if (body.errors && Object.keys(body.errors).length > 0) {
    return { note: `API reported errors: ${JSON.stringify(body.errors)}` }
  }
  if (!Array.isArray(body.response)) return { note: 'malformed API response; keeping previous overlay' }

  const byId = new Map(matches.map((m) => [m.id, m]))
  const fixtureMap = matchFixtures(body.response, matches, validSlugs, prior?.fixtureMap ?? {}, log)
  const overlays: Record<string, MatchOverlay> = { ...prior?.overlays }

  let updated = 0
  for (const fx of body.response) {
    const id = fixtureMap[String(fx.fixture.id)]
    if (!id) {
      // Only matters once a fixture has data we'd be dropping — the signal
      // that API_NAME_TO_SLUG needs calibrating.
      if (mapStatus(fx.fixture.status.short) !== 'scheduled') {
        log(`unmatched ${fx.fixture.status.short} fixture ${fx.fixture.id}: ` +
          `${fx.teams.home.name} v ${fx.teams.away.name}`)
      }
      continue
    }
    const next = fixtureToOverlay(fx, byId.get(id)!, validSlugs)
    const prev = overlays[id]
    if (prev?.status === 'finished' && next.status !== 'finished') continue // terminal — no flicker
    if (!prev && next.status === 'scheduled') continue // nothing worth recording
    overlays[id] = next
    updated++
  }

  return {
    blob: { updatedAt: new Date(now).toISOString(), fixtureMap, overlays },
    note: `updated ${updated} of ${body.response.length} fixtures`,
  }
}
