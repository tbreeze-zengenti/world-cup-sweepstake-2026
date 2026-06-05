import { describe, expect, it } from 'vitest'
import { match, team } from '../../../src/lib/fixtures'
import type { SweepstakeEntry } from '../../../src/lib/types'
import { buildSendPlan, detectTransitions, withNotified, type MatchTransition } from './notify'
import type { OverlayBlob } from './overlay'
import type { SubscriptionRecord } from './subscriptions'

const teams = ['england', 'usa', 'australia', 'saudi-arabia', 'senegal', 'france'].map((s) =>
  team(s),
)
const validSlugs = new Set(teams.map((t) => t.slug))

const sweepstake: SweepstakeEntry[] = [
  { name: 'Lindsey Breeze', team: 'england', emoji: '' },
  { name: 'Ian Turner', team: 'usa', emoji: '' },
  { name: 'Kyle', team: 'australia', emoji: '' },
  { name: 'Kyle 2', team: 'saudi-arabia', emoji: '' },
  { name: 'Moomin 😸', team: 'senegal', emoji: '' },
  { name: 'Stef 2', team: 'france', emoji: '' },
]

const staticMatches = [
  match({ id: 'm1', home: 'england', away: 'usa' }),
  match({ id: 'm2', home: 'australia', away: 'senegal' }),
  match({ id: 'm73', stage: 'r32', group: undefined, home: 'W85', away: 'W86' }),
]

const ov = (
  overlays: OverlayBlob['overlays'],
  notified?: OverlayBlob['notified'],
): OverlayBlob => ({
  updatedAt: '2026-06-11T20:00:00Z',
  fixtureMap: {},
  overlays,
  ...(notified ? { notified } : {}),
})

const detect = (prior: OverlayBlob | null, next: OverlayBlob) =>
  detectTransitions(prior, next, staticMatches, validSlugs)

describe('detectTransitions', () => {
  it('fires started on scheduled→live (absent prior entry IS scheduled)', () => {
    expect(detect(ov({}), ov({ m1: { status: 'live' } }))).toEqual([
      { event: 'started', matchId: 'm1', home: { slug: 'england' }, away: { slug: 'usa' } },
    ])
  })

  it('fires started when there is no prior blob at all', () => {
    expect(detect(null, ov({ m1: { status: 'live' } }))).toHaveLength(1)
  })

  it('fires ended with the score on live→finished', () => {
    const prior = ov({ m1: { status: 'live', score: { home: 1, away: 0 } } })
    const next = ov({ m1: { status: 'finished', score: { home: 2, away: 1 } } })
    expect(detect(prior, next)).toEqual([
      {
        event: 'ended',
        matchId: 'm1',
        home: { slug: 'england' },
        away: { slug: 'usa' },
        score: { home: 2, away: 1 },
      },
    ])
  })

  it('fires only ended on a scheduled→finished jump (poll gap missed live)', () => {
    const next = ov({ m1: { status: 'finished', score: { home: 2, away: 1 } } })
    const events = detect(ov({}), next).map((t) => t.event)
    expect(events).toEqual(['ended'])
  })

  it('never re-fires once finished', () => {
    const finished = ov({ m1: { status: 'finished', score: { home: 2, away: 1 } } })
    expect(detect(finished, finished)).toEqual([])
  })

  it('does nothing on live→live', () => {
    const live = ov({ m1: { status: 'live' } })
    expect(detect(live, live)).toEqual([])
  })

  it('drops transitions already claimed in prior.notified', () => {
    const prior = ov({}, { m1: { started: '2026-06-11T19:01:00Z' } })
    expect(detect(prior, ov({ m1: { status: 'live' } }))).toEqual([])
  })

  it('claimed started does not suppress a later ended', () => {
    const prior = ov(
      { m1: { status: 'live' } },
      { m1: { started: '2026-06-11T19:01:00Z' } },
    )
    const next = ov({ m1: { status: 'finished', score: { home: 0, away: 0 } } })
    expect(detect(prior, next).map((t) => t.event)).toEqual(['ended'])
  })

  it('skips ended when a finished overlay has no score (nothing to announce)', () => {
    expect(detect(ov({}), ov({ m1: { status: 'finished' } }))).toEqual([])
  })

  it('keeps unresolved knockout sides as placeholders', () => {
    expect(detect(ov({}), ov({ m73: { status: 'live' } }))).toEqual([
      { event: 'started', matchId: 'm73', home: { placeholder: 'W85' }, away: { placeholder: 'W86' } },
    ])
  })

  it('uses overlay-resolved slugs for knockout sides', () => {
    const next = ov({ m73: { status: 'live', home: 'france', away: 'senegal' } })
    expect(detect(ov({}), next)).toEqual([
      { event: 'started', matchId: 'm73', home: { slug: 'france' }, away: { slug: 'senegal' } },
    ])
  })

  it('carries the shootout into ended', () => {
    const next = ov({
      m73: {
        status: 'finished',
        score: { home: 1, away: 1 },
        shootout: { home: 2, away: 4 },
        home: 'france',
        away: 'senegal',
      },
    })
    expect(detect(ov({}), next)[0]).toMatchObject({
      event: 'ended',
      shootout: { home: 2, away: 4 },
    })
  })
})

describe('withNotified', () => {
  it('merges new claims onto the fresh prior markers (monotonic, no mutation)', () => {
    const blob = ov({ m1: { status: 'live' } })
    const priorNotified = { m2: { started: 'earlier', ended: 'earlier' } }
    const transitions: MatchTransition[] = [
      { event: 'started', matchId: 'm1', home: { slug: 'england' }, away: { slug: 'usa' } },
    ]
    const out = withNotified(blob, priorNotified, transitions, 'NOW')
    expect(out.notified).toEqual({
      m1: { started: 'NOW' },
      m2: { started: 'earlier', ended: 'earlier' },
    })
    expect(blob.notified).toBeUndefined() // input untouched
    expect(priorNotified.m2).toEqual({ started: 'earlier', ended: 'earlier' })
  })

  it('adds a second event to an existing match entry', () => {
    const out = withNotified(
      ov({}),
      { m1: { started: 'earlier' } },
      [
        {
          event: 'ended',
          matchId: 'm1',
          home: { slug: 'england' },
          away: { slug: 'usa' },
          score: { home: 1, away: 0 },
        },
      ],
      'NOW',
    )
    expect(out.notified).toEqual({ m1: { started: 'earlier', ended: 'NOW' } })
  })
})

const rec = (people: SubscriptionRecord['sub']['people'], key = 'k1'): SubscriptionRecord => ({
  key,
  etag: 'etag-1',
  sub: {
    endpoint: `https://fcm.googleapis.com/fcm/send/${key}`,
    keys: { p256dh: 'p', auth: 'a' },
    people,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  },
})

const started = (over: Partial<Extract<MatchTransition, { event: 'started' }>> = {}): MatchTransition => ({
  event: 'started',
  matchId: 'm1',
  home: { slug: 'england' },
  away: { slug: 'usa' },
  ...over,
})

describe('buildSendPlan', () => {
  it('returns nothing without transitions or subscriptions', () => {
    expect(buildSendPlan([], [rec({ kind: 'all' })], sweepstake, teams)).toEqual([])
    expect(buildSendPlan([started()], [], sweepstake, teams)).toEqual([])
  })

  it('"all" matches every transition; payload names teams and holders', () => {
    const plan = buildSendPlan([started()], [rec({ kind: 'all' })], sweepstake, teams)
    expect(plan).toHaveLength(1)
    expect(plan[0].payload).toEqual({
      title: '⚽️ Kick-off: england vs usa',
      body: 'england (Lindsey Breeze) vs usa (Ian Turner)',
      tag: 'm1-started',
      data: { url: '/' },
    })
  })

  it('following a person covers all their teams (Kyle → Australia + Saudi Arabia)', () => {
    const t: MatchTransition = started({
      matchId: 'm2',
      home: { slug: 'australia' },
      away: { slug: 'senegal' },
    })
    const plan = buildSendPlan([t], [rec({ kind: 'people', names: ['Kyle'] })], sweepstake, teams)
    expect(plan).toHaveLength(1)
    // ...and an unrelated match doesn't reach Kyle
    expect(
      buildSendPlan([started()], [rec({ kind: 'people', names: ['Kyle'] })], sweepstake, teams),
    ).toEqual([])
  })

  it('a person following both sides gets exactly one notification', () => {
    const plan = buildSendPlan(
      [started()],
      [rec({ kind: 'people', names: ['Lindsey Breeze', 'Ian Turner'] })],
      sweepstake,
      teams,
    )
    expect(plan).toHaveLength(1)
  })

  it('emoji holder names round-trip verbatim', () => {
    const t = started({ matchId: 'm2', home: { slug: 'australia' }, away: { slug: 'senegal' } })
    const plan = buildSendPlan(
      [t],
      [rec({ kind: 'people', names: ['Moomin 😸'] })],
      sweepstake,
      teams,
    )
    expect(plan[0].payload.body).toBe('australia (Kyle) vs senegal (Moomin 😸)')
  })

  it('"Name 2" entries collapse in the payload copy', () => {
    const t = started({ matchId: 'm73', home: { slug: 'france' }, away: { placeholder: 'W86' } })
    const plan = buildSendPlan([t], [rec({ kind: 'all' })], sweepstake, teams)
    // holder of france is the entry "Stef 2" — displayed as "Stef"
    expect(plan[0].payload.body).toBe('france (Stef) vs W86')
  })

  it('an unresolved placeholder side matches no follower and names no holder', () => {
    const t = started({ matchId: 'm73', home: { placeholder: 'W85' }, away: { placeholder: 'W86' } })
    expect(
      buildSendPlan([t], [rec({ kind: 'people', names: ['Stef'] })], sweepstake, teams),
    ).toEqual([])
    // but an "all" subscriber still isn't matched — no resolved team is playing
    expect(buildSendPlan([t], [rec({ kind: 'all' })], sweepstake, teams)).toEqual([])
  })

  it('full-time copy includes the score and a shootout line', () => {
    const t: MatchTransition = {
      event: 'ended',
      matchId: 'm73',
      home: { slug: 'france' },
      away: { slug: 'senegal' },
      score: { home: 1, away: 1 },
      shootout: { home: 2, away: 4 },
    }
    const plan = buildSendPlan([t], [rec({ kind: 'all' })], sweepstake, teams)
    expect(plan[0].payload.title).toBe('🏁 Full-time: france 1–1 senegal')
    expect(plan[0].payload.body).toBe(
      'france (Stef) 1–1 senegal (Moomin 😸) — senegal win 4–2 on penalties',
    )
    expect(plan[0].payload.tag).toBe('m73-ended')
  })

  it('fans one transition out to every matching subscription', () => {
    const plan = buildSendPlan(
      [started()],
      [
        rec({ kind: 'all' }, 'k1'),
        rec({ kind: 'people', names: ['Lindsey Breeze'] }, 'k2'),
        rec({ kind: 'people', names: ['Kyle'] }, 'k3'), // not playing
      ],
      sweepstake,
      teams,
    )
    expect(plan.map((s) => s.record.key)).toEqual(['k1', 'k2'])
  })
})
