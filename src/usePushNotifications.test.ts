import { describe, expect, it } from 'vitest'
import { capability, type PushEnv } from './usePushNotifications'

const env = (overrides: Partial<PushEnv>): PushEnv => ({
  hasServiceWorker: true,
  hasNotification: true,
  hasPushManager: true,
  isIOS: false,
  isStandalone: false,
  ...overrides,
})

describe('capability', () => {
  it('is supported when SW + Notification + PushManager all exist', () => {
    expect(capability(env({}))).toBe('supported')
  })

  it('iOS Safari without install hides PushManager → instruct, not unsupported', () => {
    expect(capability(env({ isIOS: true, hasPushManager: false, hasNotification: false }))).toBe(
      'ios-needs-install',
    )
  })

  it('iOS installed PWA with push available is supported', () => {
    expect(capability(env({ isIOS: true, isStandalone: true }))).toBe('supported')
  })

  it('non-iOS browsers missing push are unsupported', () => {
    expect(capability(env({ hasPushManager: false }))).toBe('unsupported')
    expect(capability(env({ hasServiceWorker: false }))).toBe('unsupported')
  })
})
