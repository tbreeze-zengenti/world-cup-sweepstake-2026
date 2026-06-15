#!/usr/bin/env node
/**
 * Patch data/matches.json with results and bookings for one matchday.
 *
 * Usage:
 *   node scripts/apply-results.mjs updates.json
 *   node scripts/apply-results.mjs -            # read JSON from stdin
 *
 * Input is a JSON array of partial match records keyed by id. Only the fields
 * you supply are touched; everything else (kickoff, venue, group, …) is left
 * alone. This is the safe, deterministic way to enter results — it never
 * re-orders or rewrites untouched matches.
 *
 *   [
 *     {
 *       "id": "m14",
 *       "status": "finished",
 *       "score": { "home": 1, "away": 1 },
 *       "cards": {
 *         "home": { "yellow": 2 },
 *         "away": { "yellow": 1, "red": 1, "secondYellow": 1 }
 *       }
 *     }
 *   ]
 *
 * Card fields are optional and default to 0; zero/empty values are dropped on
 * write so the file stays clean. Knockout results may carry `shootout` and
 * resolved `home`/`away` slugs instead of `cards`.
 *
 * Invariants enforced (same as src/lib/data.test.ts — fail fast, before push):
 *   - finished  → must have a score
 *   - scheduled → must NOT have a score (and any score/cards are cleared)
 *   - cards     → group stage only
 *   - shootout  → knockout only, requires a drawn score and a non-drawn shootout
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const matchesPath = path.join(root, 'data', 'matches.json')

const arg = process.argv[2]
if (!arg) {
  console.error('Usage: node scripts/apply-results.mjs <updates.json | ->')
  process.exit(1)
}
const raw = arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8')

let updates
try {
  updates = JSON.parse(raw)
} catch (e) {
  console.error(`Could not parse updates JSON: ${e.message}`)
  process.exit(1)
}
if (!Array.isArray(updates)) {
  console.error('Updates must be a JSON array of match records.')
  process.exit(1)
}

const matches = JSON.parse(readFileSync(matchesPath, 'utf8'))
const byId = new Map(matches.map((m) => [m.id, m]))

/** Keep only positive integer card fields; return undefined if a side is clean. */
function cleanSide(side = {}) {
  const out = {}
  for (const k of ['yellow', 'red', 'secondYellow']) {
    const v = side[k]
    if (v == null) continue
    if (!Number.isInteger(v) || v < 0) throw new Error(`card field ${k}=${v} must be a non-negative integer`)
    if (v > 0) out[k] = v
  }
  return Object.keys(out).length ? out : {}
}

const errors = []
const summary = []

for (const u of updates) {
  const m = byId.get(u.id)
  if (!m) {
    errors.push(`unknown match id "${u.id}"`)
    continue
  }

  const status = u.status ?? m.status
  if (status !== 'finished' && status !== 'scheduled' && status !== 'live') {
    errors.push(`${u.id}: invalid status "${status}"`)
    continue
  }
  m.status = status

  if ('home' in u) m.home = u.home
  if ('away' in u) m.away = u.away

  if (status === 'scheduled') {
    // Reverting to scheduled clears any result data (test forbids a stray score).
    delete m.score
    delete m.shootout
    delete m.cards
    summary.push(`${u.id.padEnd(4)} scheduled`)
    continue
  }

  // finished / live
  if (u.score) {
    if (!Number.isInteger(u.score.home) || !Number.isInteger(u.score.away)) {
      errors.push(`${u.id}: score must be integers`)
      continue
    }
    m.score = { home: u.score.home, away: u.score.away }
  }
  if (status === 'finished' && !m.score) {
    errors.push(`${u.id}: finished match has no score (supply "score")`)
    continue
  }

  if (u.shootout) {
    if (m.stage === 'group') errors.push(`${u.id}: shootout not allowed in group stage`)
    else if (m.score.home !== m.score.away) errors.push(`${u.id}: shootout requires a drawn score`)
    else if (u.shootout.home === u.shootout.away) errors.push(`${u.id}: shootout cannot be drawn`)
    else m.shootout = { home: u.shootout.home, away: u.shootout.away }
  }

  if (u.cards) {
    if (m.stage !== 'group') {
      errors.push(`${u.id}: cards only tracked for group stage`)
      continue
    }
    try {
      m.cards = { home: cleanSide(u.cards.home), away: cleanSide(u.cards.away) }
    } catch (e) {
      errors.push(`${u.id}: ${e.message}`)
      continue
    }
  }

  const c = m.cards
  const fmt = (s) => `${s?.yellow ?? 0}Y ${s?.red ?? 0}R ${s?.secondYellow ?? 0}2nd`
  summary.push(
    `${u.id.padEnd(4)} ${m.home} ${m.score.home}-${m.score.away} ${m.away}` +
      (c ? `  cards ${fmt(c.home)} | ${fmt(c.away)}` : '  (no cards yet)'),
  )
}

// Warn (don't fail) on finished group matches still missing cards — they won't
// score in Sweepstake 3 until entered.
for (const m of matches) {
  if (m.stage === 'group' && m.status === 'finished' && !m.cards) {
    summary.push(`note: ${m.id} finished but has no cards — Sweepstake 3 will skip it`)
  }
}

if (errors.length) {
  console.error('Refusing to write — fix these first:')
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}

writeFileSync(matchesPath, JSON.stringify(matches, null, 2) + '\n')
console.log(summary.join('\n'))
console.log(`\nWrote ${matchesPath}. Run \`npm test\` to validate, then commit & push.`)
