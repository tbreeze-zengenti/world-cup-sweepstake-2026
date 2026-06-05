import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPushPrefs, loadPushPrefs, savePushPrefs } from './pushPrefs'

function stubStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  })
  return map
}

beforeEach(() => stubStorage())
afterEach(() => vi.unstubAllGlobals())

describe('pushPrefs', () => {
  it('round-trips a people selection (emoji names intact)', () => {
    savePushPrefs({ enabled: true, target: { kind: 'people', names: ['Kyle', 'Moomin 😸'] } })
    expect(loadPushPrefs()).toEqual({
      enabled: true,
      target: { kind: 'people', names: ['Kyle', 'Moomin 😸'] },
    })
  })

  it('round-trips kind:all', () => {
    savePushPrefs({ enabled: true, target: { kind: 'all' } })
    expect(loadPushPrefs()).toEqual({ enabled: true, target: { kind: 'all' } })
  })

  it('clears', () => {
    savePushPrefs({ enabled: true, target: { kind: 'all' } })
    clearPushPrefs()
    expect(loadPushPrefs()).toBeNull()
  })

  it.each([
    'not json',
    '{}',
    '{"enabled":"yes","target":{"kind":"all"}}',
    '{"enabled":true,"target":{"kind":"people","names":[]}}',
    '{"enabled":true,"target":{"kind":"people","names":[1]}}',
    '{"enabled":true,"target":"all"}',
  ])('rejects corrupt stored values: %s', (raw) => {
    stubStorage({ 'push-prefs': raw })
    expect(loadPushPrefs()).toBeNull()
  })

  it('survives unavailable storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    })
    expect(loadPushPrefs()).toBeNull()
    expect(() => savePushPrefs({ enabled: true, target: { kind: 'all' } })).not.toThrow()
    expect(() => clearPushPrefs()).not.toThrow()
  })
})
