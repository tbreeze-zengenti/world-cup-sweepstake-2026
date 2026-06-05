import { describe, expect, it } from 'vitest'
import {
  endpointKey,
  isAllowedEndpoint,
  parseDeleteRequest,
  parseSubscribeRequest,
} from './subscriptions'

const NAMES = new Set(['Kyle', 'Lindsey Breeze', 'Moomin 😸'])

const FCM = 'https://fcm.googleapis.com/fcm/send/abc123'
const KEYS = { p256dh: 'BPx'.padEnd(87, 'a'), auth: 'aBcD-_'.padEnd(22, 'x') }
const wire = (endpoint = FCM) => ({ subscription: { endpoint, keys: { ...KEYS } } })

describe('endpointKey', () => {
  it('derives a stable sha256 hex key', () => {
    expect(endpointKey(FCM)).toMatch(/^[0-9a-f]{64}$/)
    expect(endpointKey(FCM)).toBe(endpointKey(FCM))
    expect(endpointKey(FCM)).not.toBe(endpointKey(`${FCM}x`))
  })
})

describe('isAllowedEndpoint', () => {
  it.each([
    FCM,
    'https://updates.push.services.mozilla.com/wpush/v2/xyz',
    'https://db5p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/QOj1234',
    'https://jmt17.google.com/fcm/send/xyz', // unbranded Chromium
  ])('accepts real push services: %s', (url) => {
    expect(isAllowedEndpoint(url)).toBe(true)
  })

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc', // not https
    'https://evil.example.com/collect', // arbitrary host
    'https://169.254.169.254/latest/meta-data', // metadata SSRF
    'https://localhost/push', // internal
    'https://fcm.googleapis.com.evil.com/x', // suffix spoof
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(isAllowedEndpoint(url)).toBe(false)
  })

  it('rejects oversized endpoints', () => {
    expect(isAllowedEndpoint(`${FCM}/${'a'.repeat(1024)}`)).toBe(false)
  })
})

describe('parseSubscribeRequest', () => {
  it('accepts a minimal re-subscribe (no people — server preserves)', () => {
    const parsed = parseSubscribeRequest(wire(), NAMES)
    expect(parsed).toEqual({ subscription: { endpoint: FCM, keys: KEYS } })
  })

  it('accepts kind:all', () => {
    const parsed = parseSubscribeRequest({ ...wire(), people: { kind: 'all' } }, NAMES)
    expect(parsed?.people).toEqual({ kind: 'all' })
  })

  it('accepts known people, dedupes, preserves emoji names verbatim', () => {
    const parsed = parseSubscribeRequest(
      { ...wire(), people: { kind: 'people', names: ['Kyle', 'Moomin 😸', 'Kyle'] } },
      NAMES,
    )
    expect(parsed?.people).toEqual({ kind: 'people', names: ['Kyle', 'Moomin 😸'] })
  })

  it('rejects unknown people', () => {
    expect(
      parseSubscribeRequest({ ...wire(), people: { kind: 'people', names: ['Nobody'] } }, NAMES),
    ).toBeNull()
  })

  it('rejects an empty names array', () => {
    expect(
      parseSubscribeRequest({ ...wire(), people: { kind: 'people', names: [] } }, NAMES),
    ).toBeNull()
  })

  it('rejects a sentinel-style people value (house style is the union)', () => {
    expect(parseSubscribeRequest({ ...wire(), people: 'all' }, NAMES)).toBeNull()
    expect(parseSubscribeRequest({ ...wire(), people: ['Kyle'] }, NAMES)).toBeNull()
  })

  it('rejects malformed crypto keys', () => {
    const bad = { subscription: { endpoint: FCM, keys: { p256dh: 'not base64url!!', auth: 'ok' } } }
    expect(parseSubscribeRequest(bad, NAMES)).toBeNull()
    const oversized = {
      subscription: { endpoint: FCM, keys: { p256dh: 'a'.repeat(257), auth: 'abc' } },
    }
    expect(parseSubscribeRequest(oversized, NAMES)).toBeNull()
  })

  it('rejects disallowed endpoints and oldEndpoints', () => {
    expect(parseSubscribeRequest(wire('https://evil.example.com/x'), NAMES)).toBeNull()
    expect(
      parseSubscribeRequest({ ...wire(), oldEndpoint: 'https://evil.example.com/x' }, NAMES),
    ).toBeNull()
  })

  it('accepts a valid oldEndpoint (rotation)', () => {
    const old = 'https://web.push.apple.com/previous'
    expect(parseSubscribeRequest({ ...wire(), oldEndpoint: old }, NAMES)?.oldEndpoint).toBe(old)
  })

  it('rejects junk', () => {
    expect(parseSubscribeRequest(null, NAMES)).toBeNull()
    expect(parseSubscribeRequest('x', NAMES)).toBeNull()
    expect(parseSubscribeRequest({}, NAMES)).toBeNull()
    expect(parseSubscribeRequest({ subscription: { endpoint: FCM } }, NAMES)).toBeNull()
  })
})

describe('parseDeleteRequest', () => {
  it('extracts a valid endpoint', () => {
    expect(parseDeleteRequest({ endpoint: FCM })).toBe(FCM)
  })
  it('rejects invalid bodies', () => {
    expect(parseDeleteRequest(null)).toBeNull()
    expect(parseDeleteRequest({})).toBeNull()
    expect(parseDeleteRequest({ endpoint: 'https://evil.example.com' })).toBeNull()
  })
})
