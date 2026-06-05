import type { SweepstakeEntry, Team } from './types'
import { personName } from './holders'

export type Selection =
  | { kind: 'none' }
  | { kind: 'person'; name: string }
  | { kind: 'country'; slug: string }

const KEY = 'highlight'

export function loadSelection(): Selection {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (v?.kind === 'person' && typeof v.name === 'string') return { kind: 'person', name: v.name }
      if (v?.kind === 'country' && typeof v.slug === 'string') return { kind: 'country', slug: v.slug }
    }
  } catch {
    // corrupt or unavailable storage — fall through to none
  }
  return { kind: 'none' }
}

export function saveSelection(sel: Selection): void {
  try {
    if (sel.kind === 'none') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(sel))
  } catch {
    // storage unavailable — selection just won't persist
  }
}

/** Unique person names (entries like "X 2" collapse onto "X"), sorted. */
export function personOptions(sweepstake: SweepstakeEntry[]): string[] {
  return [...new Set(sweepstake.map((e) => personName(e.name)))].sort((a, b) => a.localeCompare(b))
}

/** Team slugs to highlight for the current selection. */
export function highlightSlugs(sel: Selection, sweepstake: SweepstakeEntry[], teams: Team[]): Set<string> {
  if (sel.kind === 'country') return new Set([sel.slug])
  if (sel.kind === 'person') {
    const teamByName = new Map(teams.map((t) => [t.name, t]))
    return new Set(
      sweepstake
        .filter((e) => personName(e.name) === sel.name)
        .map((e) => teamByName.get(e.team)?.slug)
        .filter((s): s is string => !!s),
    )
  }
  return new Set()
}
