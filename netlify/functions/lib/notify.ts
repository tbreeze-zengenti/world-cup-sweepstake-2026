import { followedSlugs, holdersByTeam, personName } from '../../../src/lib/holders'
import type { PushPayload } from '../../../src/lib/push'
import type { Match, SweepstakeEntry, Team } from '../../../src/lib/types'
import type { MatchEvent, OverlayBlob } from './overlay'
import type { SubscriptionRecord } from './subscriptions'

/** A match side: resolved team slug, or a knockout placeholder ("W73"). */
export type TeamRef = { slug: string } | { placeholder: string }

/**
 * One notifiable status transition. Discriminated on event so `ended`
 * always carries a score — no `score!` in the copy builder.
 */
export type MatchTransition =
  | { event: 'started'; matchId: string; home: TeamRef; away: TeamRef }
  | {
      event: 'ended'
      matchId: string
      home: TeamRef
      away: TeamRef
      score: { home: number; away: number }
      shootout?: { home: number; away: number }
    }

const sideRef = (
  overlaySlug: string | undefined,
  staticSide: string,
  validSlugs: ReadonlySet<string>,
): TeamRef => {
  const slug = overlaySlug ?? (validSlugs.has(staticSide) ? staticSide : undefined)
  return slug ? { slug } : { placeholder: staticSide }
}

/**
 * Diff prior vs next overlay status into started/ended transitions.
 *
 * Rules (see the plan's transition contract):
 * - absent prior IS 'scheduled' — scheduled matches aren't recorded, so the
 *   first 'live' observation correctly fires `started`
 * - scheduled→finished in one poll gap fires only `ended` (a kick-off
 *   announcement for a finished match is misleading)
 * - 'finished' is terminal: never re-fires
 * - transitions already claimed in prior.notified are dropped (the CAS
 *   retry path recomputes against the fresh marker set)
 * - a finished overlay without a score (e.g. an awarded walkover the API
 *   reports goalless) produces no `ended` — there is nothing to announce
 */
export function detectTransitions(
  prior: OverlayBlob | null,
  next: OverlayBlob,
  staticMatches: Match[],
  validSlugs: ReadonlySet<string>,
): MatchTransition[] {
  const byId = new Map(staticMatches.map((m) => [m.id, m]))
  const out: MatchTransition[] = []
  for (const [matchId, o] of Object.entries(next.overlays)) {
    const m = byId.get(matchId)
    if (!m) continue
    const prevStatus = prior?.overlays[matchId]?.status ?? 'scheduled'
    const notified = prior?.notified?.[matchId]
    const home = sideRef(o.home, m.home, validSlugs)
    const away = sideRef(o.away, m.away, validSlugs)

    if (prevStatus === 'scheduled' && o.status === 'live' && !notified?.started) {
      out.push({ event: 'started', matchId, home, away })
    }
    if (prevStatus !== 'finished' && o.status === 'finished' && !notified?.ended && o.score) {
      out.push({
        event: 'ended',
        matchId,
        home,
        away,
        score: o.score,
        ...(o.shootout ? { shootout: o.shootout } : {}),
      })
    }
  }
  return out
}

/**
 * Merge send-claim markers for these transitions onto a blob about to be
 * written. priorNotified is the *fresh* prior's marker set — markers are
 * monotonic, so merge, never overwrite from a stale snapshot.
 */
export function withNotified(
  blob: OverlayBlob,
  priorNotified: OverlayBlob['notified'],
  transitions: MatchTransition[],
  nowIso: string,
): OverlayBlob {
  const notified: NonNullable<OverlayBlob['notified']> = {}
  for (const [id, events] of Object.entries(priorNotified ?? {})) notified[id] = { ...events }
  for (const t of transitions) {
    notified[t.matchId] = { ...notified[t.matchId], [t.event satisfies MatchEvent]: nowIso }
  }
  return { ...blob, notified }
}

export interface Send {
  record: SubscriptionRecord
  payload: PushPayload
}

/**
 * Fan a transition list out across subscriptions. Pure: returns the exact
 * sends to make; the orchestrator owns delivery, budgets and pruning.
 * Uses entry name/team only — the Slack-style `emoji` field is intentionally
 * ignored (display names already carry real emoji, e.g. "Moomin 😸").
 */
export function buildSendPlan(
  transitions: MatchTransition[],
  subscriptions: SubscriptionRecord[],
  sweepstake: SweepstakeEntry[],
  teams: Team[],
): Send[] {
  if (transitions.length === 0 || subscriptions.length === 0) return []
  const teamBySlug = new Map(teams.map((t) => [t.slug, t]))
  const holders = holdersByTeam(sweepstake, teams)

  const teamName = (ref: TeamRef) =>
    'slug' in ref ? (teamBySlug.get(ref.slug)?.name ?? ref.slug) : ref.placeholder
  // "England (Lindsey Breeze)" — holder collapsed ("Kyle 2" → "Kyle");
  // an unresolved placeholder side has no holder to name.
  const sideLabel = (ref: TeamRef) => {
    const name = teamName(ref)
    const holder = 'slug' in ref ? holders.get(ref.slug) : undefined
    return holder ? `${name} (${personName(holder.name)})` : name
  }

  const payloads = new Map<MatchTransition, PushPayload>(
    transitions.map((t) => {
      let title: string
      let body: string
      if (t.event === 'started') {
        title = `⚽️ Kick-off: ${teamName(t.home)} vs ${teamName(t.away)}`
        body = `${sideLabel(t.home)} vs ${sideLabel(t.away)}`
      } else {
        const score = `${t.score.home}–${t.score.away}`
        title = `🏁 Full-time: ${teamName(t.home)} ${score} ${teamName(t.away)}`
        body = `${sideLabel(t.home)} ${score} ${sideLabel(t.away)}`
        if (t.shootout) {
          const winner = t.shootout.home > t.shootout.away ? t.home : t.away
          const pens =
            t.shootout.home > t.shootout.away
              ? `${t.shootout.home}–${t.shootout.away}`
              : `${t.shootout.away}–${t.shootout.home}`
          body += ` — ${teamName(winner)} win ${pens} on penalties`
        }
      }
      return [t, { title, body, tag: `${t.matchId}-${t.event}`, data: { url: '/' } }]
    }),
  )

  const matchSlugs = (t: MatchTransition): string[] => {
    const slugs: string[] = []
    if ('slug' in t.home) slugs.push(t.home.slug)
    if ('slug' in t.away) slugs.push(t.away.slug)
    return slugs
  }

  const out: Send[] = []
  for (const record of subscriptions) {
    const followed = followedSlugs(record.sub.people, sweepstake, teams)
    for (const t of transitions) {
      if (matchSlugs(t).some((s) => followed.has(s))) {
        out.push({ record, payload: payloads.get(t)! })
      }
    }
  }
  return out
}
