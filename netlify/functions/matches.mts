/**
 * Serves /matches.json (a force redirect in netlify.toml shadows the static
 * file): the organiser-edited data/matches.json merged with the live overlay
 * written by poll-matches. Never errors to the client — if the blob is
 * missing or unreadable it serves the bundled static data unchanged.
 */
import { getStore } from '@netlify/blobs'
import staticMatches from '../../data/matches.json'
import type { Match } from '../../src/lib/types'
import { mergeMatches } from './lib/merge'
import { BLOB_KEY, BLOB_STORE, type OverlayBlob } from './lib/overlay'

export default async (): Promise<Response> => {
  let matches = staticMatches as Match[]
  try {
    const blob = ((await getStore(BLOB_STORE).get(BLOB_KEY, { type: 'json' })) ??
      null) as OverlayBlob | null
    matches = mergeMatches(matches, blob)
  } catch (err) {
    console.error('overlay unavailable — serving static matches.json', err)
  }
  return new Response(JSON.stringify(matches), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-cache' },
  })
}
