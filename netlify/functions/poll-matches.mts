/**
 * Scheduled every 15 minutes. Exits instantly outside match windows (no API
 * request, no blob access); during a window it fetches all World Cup fixtures
 * from API-Football in one request, transforms them to our schema and stores
 * the result as an overlay blob that the matches function merges at serve
 * time. data/matches.json itself is never touched — it remains the fallback.
 */
import { getStore } from '@netlify/blobs'
import type { Config } from '@netlify/functions'
import staticMatches from '../../data/matches.json'
import teams from '../../data/teams.json'
import type { Match } from '../../src/lib/types'
import { BLOB_KEY, BLOB_STORE, type OverlayBlob } from './lib/overlay'
import { inActiveWindow, runPoll } from './lib/poll'

const matches = staticMatches as Match[]

export default async () => {
  const now = Date.now()
  if (!inActiveWindow(matches, now)) {
    console.log('no active match window — skipping API request')
    return
  }

  const store = getStore(BLOB_STORE)
  const prior = ((await store.get(BLOB_KEY, { type: 'json' })) ?? null) as OverlayBlob | null

  const result = await runPoll({
    fetchFn: fetch,
    apiKey: process.env.API_FOOTBALL_KEY,
    now,
    matches,
    validSlugs: new Set(teams.map((t) => t.slug)),
    prior,
  })

  if (result.blob) await store.setJSON(BLOB_KEY, result.blob)
  console.log(result.note)
}

export const config: Config = { schedule: '*/15 * * * *' }
