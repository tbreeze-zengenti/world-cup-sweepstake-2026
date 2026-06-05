import { describe, expect, it, vi } from 'vitest'
import { match } from '../../../src/lib/fixtures'
import { fdMatch } from './fixtures'
import type { FdMatch } from './footballData'
import type { OverlayBlob } from './overlay'
import { inActiveWindow, runPoll } from './poll'

const KICKOFF = '2026-06-11T13:00:00-06:00'
const kickoffMs = new Date(KICKOFF).getTime()
const matches = [match({ id: 'm1', home: 'mexico', away: 'south-africa', kickoff: KICKOFF })]
const validSlugs = new Set(['mexico', 'south-africa'])

const apiResponse = (fdMatches: FdMatch[], init?: ResponseInit) =>
  new Response(JSON.stringify({ matches: fdMatches }), {
    headers: { 'content-type': 'application/json' },
    ...init,
  })

const deps = (over: Partial<Parameters<typeof runPoll>[0]> = {}) => ({
  fetchFn: vi.fn().mockResolvedValue(apiResponse([])) as unknown as typeof fetch,
  apiKey: 'test-token',
  now: kickoffMs + 60_000, // a minute after kickoff
  matches,
  validSlugs,
  prior: null,
  log: () => {},
  ...over,
})

describe('inActiveWindow', () => {
  it('is false before kickoff and after the window, true during', () => {
    expect(inActiveWindow(matches, kickoffMs - 1)).toBe(false)
    expect(inActiveWindow(matches, kickoffMs)).toBe(true)
    expect(inActiveWindow(matches, kickoffMs + 3 * 60 * 60 * 1000)).toBe(true)
    expect(inActiveWindow(matches, kickoffMs + 4 * 60 * 60 * 1000)).toBe(false)
  })
})

describe('runPoll', () => {
  it('skips the API entirely outside a match window', async () => {
    const d = deps({ now: kickoffMs - 60_000 })
    const result = await runPoll(d)
    expect(result.blob).toBeUndefined()
    expect(d.fetchFn).not.toHaveBeenCalled()
  })

  it('throws when the API token is missing during a window', async () => {
    await expect(runPoll(deps({ apiKey: undefined }))).rejects.toThrow('FOOTBALL_DATA_TOKEN')
  })

  it('fetches, binds and stores overlays for live matches', async () => {
    const fd = fdMatch({ id: 7, home: 'Mexico', away: 'South Africa', kickoff: '2026-06-11T19:00:00Z', status: 'IN_PLAY', fullTime: [1, 0] })
    const fetchFn = vi.fn().mockResolvedValue(apiResponse([fd])) as unknown as typeof fetch
    const result = await runPoll(deps({ fetchFn }))
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1].headers).toEqual({
      'X-Auth-Token': 'test-token',
    })
    expect(result.blob).toMatchObject({
      fixtureMap: { '7': 'm1' },
      overlays: { m1: { status: 'live', score: { home: 1, away: 0 } } },
    })
  })

  it('keeps the previous overlay on API errors', async () => {
    for (const bad of [
      apiResponse([], { status: 429 }),
      apiResponse([], { status: 403 }),
      new Response(JSON.stringify({ message: 'no matches field' })),
    ]) {
      const result = await runPoll(deps({ fetchFn: vi.fn().mockResolvedValue(bad) as unknown as typeof fetch }))
      expect(result.blob).toBeUndefined()
    }
  })

  it('never downgrades a finished overlay and skips untracked scheduled matches', async () => {
    const prior: OverlayBlob = {
      updatedAt: '2026-06-11T18:00:00Z',
      fixtureMap: { '7': 'm1' },
      overlays: { m1: { status: 'finished', score: { home: 2, away: 1 } } },
    }
    const fixtures = [
      // late API correction back to live must not flicker the result
      fdMatch({ id: 7, home: 'Mexico', away: 'South Africa', kickoff: '2026-06-11T19:00:00Z', status: 'IN_PLAY', fullTime: [2, 1] }),
    ]
    const result = await runPoll(
      deps({ prior, fetchFn: vi.fn().mockResolvedValue(apiResponse(fixtures)) as unknown as typeof fetch }),
    )
    expect(result.blob!.overlays.m1).toEqual({ status: 'finished', score: { home: 2, away: 1 } })
  })

  it('does not record overlays for matches that are still scheduled', async () => {
    const fd = fdMatch({ id: 7, home: 'Mexico', away: 'South Africa', kickoff: '2026-06-11T19:00:00Z', status: 'TIMED' })
    const result = await runPoll(
      deps({ fetchFn: vi.fn().mockResolvedValue(apiResponse([fd])) as unknown as typeof fetch }),
    )
    expect(result.blob!.overlays).toEqual({})
    expect(result.blob!.fixtureMap).toEqual({ '7': 'm1' }) // binding still learned
  })
})
