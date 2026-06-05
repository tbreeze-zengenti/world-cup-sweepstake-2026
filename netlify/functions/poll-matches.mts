/**
 * Scheduled every 5 minutes. Exits instantly outside match windows (no API
 * request, no blob access); during a window it fetches all World Cup matches
 * from football-data.org in one request, transforms them to our schema and
 * stores the result as an overlay blob that the matches function merges at
 * serve time. data/matches.json itself is never touched — it remains the
 * fallback.
 *
 * Push layer (strictly additive — must never break the poll):
 * 1. diff prior vs next overlay into started/ended transitions
 * 2. claim them: commit `notified` markers with the overlay via
 *    compare-and-swap (onlyIfMatch etag); on contention re-read and
 *    recompute, so overlapping runs can't double-send (at-most-once)
 * 3. only when transitions were won: load subscriptions (strong, parallel)
 *    and fan out web-push sends under a wall-clock budget, pruning dead
 *    endpoints on 404/410
 */
import { getStore } from '@netlify/blobs'
import type { Config } from '@netlify/functions'
import staticMatches from '../../data/matches.json'
import sweepstake from '../../data/sweepstake.json'
import teams from '../../data/teams.json'
import type { Match } from '../../src/lib/types'
import { BLOB_KEY, BLOB_STORE, type OverlayBlob } from './lib/overlay'
import { buildSendPlan, detectTransitions, withNotified, type MatchTransition } from './lib/notify'
import { inActiveWindow, runPoll } from './lib/poll'
import { loadSubscriptions, SUBS_STORE } from './lib/subscriptions'
import { createSender } from './lib/webPush'

const matches = staticMatches as Match[]
const validSlugs = new Set(teams.map((t) => t.slug))

const CAS_ATTEMPTS = 3
const SEND_CONCURRENCY = 10
const SEND_WALL_BUDGET_MS = 20_000

export default async () => {
  const now = Date.now()
  if (!inActiveWindow(matches, now)) {
    console.log('no active match window — skipping API request')
    return
  }

  const store = getStore(BLOB_STORE)
  const priorRes = await store.getWithMetadata(BLOB_KEY, { type: 'json', consistency: 'strong' })
  let prior = (priorRes?.data ?? null) as OverlayBlob | null
  let priorEtag = priorRes?.etag

  const result = await runPoll({
    fetchFn: fetch,
    apiKey: process.env.FOOTBALL_DATA_TOKEN,
    now,
    matches,
    validSlugs,
    prior,
  })
  console.log(result.note)
  if (!result.blob) return

  // Commit overlay + send-claim markers via CAS. Markers are written before
  // any send: a lost write means a missed alert, never a duplicate.
  let transitions = detectTransitions(prior, result.blob, matches, validSlugs)
  let written = false
  for (let attempt = 0; attempt < CAS_ATTEMPTS && !written; attempt++) {
    // Merge a competing writer's overlays under ours so a lost race can't
    // drop its updates; markers are merge-only via withNotified.
    const blob: OverlayBlob = attempt === 0
      ? result.blob
      : { ...result.blob, overlays: { ...prior?.overlays, ...result.blob.overlays } }
    const toWrite = withNotified(blob, prior?.notified, transitions, new Date(now).toISOString())
    // CAS: match the etag we read, or require-new when nothing existed. If a
    // blob exists but the runtime gave us no etag (e.g. local dev), fall back
    // to an unconditional write — degraded dedupe, but the live-data path
    // must never be blocked.
    const condition = priorEtag ? { onlyIfMatch: priorEtag } : prior ? undefined : { onlyIfNew: true }
    const write = await store.setJSON(BLOB_KEY, toWrite, condition)
    if (write.modified) {
      written = true
      break
    }
    const fresh = await store.getWithMetadata(BLOB_KEY, { type: 'json', consistency: 'strong' })
    prior = (fresh?.data ?? null) as OverlayBlob | null
    priorEtag = fresh?.etag
    transitions = detectTransitions(prior, result.blob, matches, validSlugs)
  }
  if (!written) {
    console.log(`overlay write lost CAS ${CAS_ATTEMPTS}x — competing run owns this cycle`)
    return
  }

  // Push sends: own failure domain. Counts and timings only in logs — never
  // endpoints, keys or holder names.
  try {
    await sendPushes(transitions)
  } catch (err) {
    console.error('push layer failed — poll unaffected', err)
  }
}

async function sendPushes(transitions: MatchTransition[]): Promise<void> {
  if (transitions.length === 0) return // ~95% of in-window polls: zero subscription I/O

  const sender = createSender({
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT,
  })
  if (!sender) {
    console.log(`push: VAPID not configured — skipped ${transitions.length} transition(s)`)
    return
  }

  const subsStore = getStore({ name: SUBS_STORE, consistency: 'strong' })
  const t0 = Date.now()
  const records = await loadSubscriptions(subsStore)
  const readsMs = Date.now() - t0
  const plan = buildSendPlan(transitions, records, sweepstake, teams)

  let sent = 0
  let failed = 0
  let pruned = 0
  let skipped = 0
  const t1 = Date.now()
  for (let i = 0; i < plan.length; i += SEND_CONCURRENCY) {
    if (Date.now() - t1 > SEND_WALL_BUDGET_MS) {
      skipped = plan.length - i
      break
    }
    const chunk = plan.slice(i, i + SEND_CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map(async ({ record, payload }) => {
        const { statusCode } = await sender(record.sub, payload)
        if (statusCode === 404 || statusCode === 410) {
          // Dead subscription. Conditional prune: skip if the blob changed
          // since we loaded it (a re-subscribe must not be deleted by a
          // stale 410 from its previous incarnation).
          const current = await subsStore.getWithMetadata(record.key, { consistency: 'strong' })
          if (current && record.etag && current.etag !== record.etag) return 'failed'
          await subsStore.delete(record.key)
          return 'pruned'
        }
        return statusCode < 400 ? 'sent' : 'failed'
      }),
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value === 'sent') sent++
      else if (r.status === 'fulfilled' && r.value === 'pruned') pruned++
      else failed++
    }
  }
  console.log(
    `push: transitions=${transitions.length} subs=${records.length} planned=${plan.length} ` +
      `sent=${sent} failed=${failed} pruned=${pruned} skipped=${skipped} ` +
      `reads=${readsMs}ms sends=${Date.now() - t1}ms`,
  )
}

export const config: Config = { schedule: '*/5 * * * *' }
