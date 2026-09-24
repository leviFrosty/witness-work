import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUDDY_PUSH_KINDS } from '@/features/buddies/lib/engine'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'

const { registerPush, buddiesState } = vi.hoisted(() => ({
  registerPush: vi.fn(),
  buddiesState: { registeredInboxId: 'inbox', notificationsEnabled: true },
}))

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ granted: true }),
  getDevicePushTokenAsync: async () => ({ data: 'token' }),
}))
vi.mock('expo-application', () => ({
  getIosPushNotificationServiceEnvironmentAsync: async () => 'development',
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/features/buddies/lib/buddiesService', () => ({
  buddiesEngine: { registerPush },
}))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: { getState: () => buddiesState },
}))

describe('registerBuddiesPush', () => {
  beforeEach(() => {
    registerPush.mockClear()
    buddiesState.notificationsEnabled = true
  })

  it('registers a localized template for every Buddies push kind', async () => {
    await registerBuddiesPush()
    const { templates, apnsEnvironment } = registerPush.mock.calls[0][0]
    expect(apnsEnvironment).toBe('sandbox')
    expect(Object.keys(templates).sort()).toEqual([...BUDDY_PUSH_KINDS].sort())
    // The relay accepts at most 32 templates per device.
    expect(Object.keys(templates).length).toBeLessThanOrEqual(32)
    for (const template of Object.values(templates))
      expect(template).toEqual({
        title: expect.stringMatching(/^buddies_push/),
        body: expect.stringMatching(/^buddies_push/),
      })
  })

  it('registers no templates with Buddies notifications off', async () => {
    buddiesState.notificationsEnabled = false
    await registerBuddiesPush()
    expect(registerPush.mock.calls[0][0].templates).toEqual({})
  })
})
