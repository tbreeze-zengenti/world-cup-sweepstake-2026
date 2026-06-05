import type { Match } from '../../../src/lib/types'
import type { OverlayBlob } from './overlay'

/**
 * Apply the API overlay to the organiser-edited static matches. The overlay
 * wins for status/score/shootout and resolved knockout sides; everything the
 * API doesn't supply (cards, venue, kickoff, group) survives untouched.
 * No blob → the static data passes through unchanged.
 */
export function mergeMatches(
  staticMatches: Match[],
  blob: OverlayBlob | null | undefined,
): Match[] {
  const overlays = blob?.overlays
  if (!overlays) return staticMatches
  return staticMatches.map((m) => {
    const o = overlays[m.id]
    if (!o) return m
    const merged: Match = { ...m, status: o.status }
    if (o.score) merged.score = o.score
    if (o.shootout) merged.shootout = o.shootout
    if (o.home) merged.home = o.home
    if (o.away) merged.away = o.away
    return merged
  })
}
