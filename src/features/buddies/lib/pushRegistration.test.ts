import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUDDY_PUSH_KINDS } from '@/features/buddies/lib/engine'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'

const { registerPush, buddiesState, app, capture } = vi.hoisted(() => ({
  registerPush: vi.fn(
    async (_device: {
      apnsEnvironment: string
      apnsTopic?: string
      templates: Record<string, unknown>
    }) => 'registered'
  ),
  buddiesState: { registeredInboxId: 'inbox', notificationsEnabled: true },
  app: { applicationId: 'com.leviwilkerson.jwtimebeta' as string | null },
  capture: vi.fn(),
}))

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ granted: true }),
  getDevicePushTokenAsync: async () => ({ data: 'token' }),
}))
vi.mock('expo-application', () => ({
  get applicationId() {
    return app.applicationId
  },
  getIosPushNotificationServiceEnvironmentAsync: async () => 'development',
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture } }))
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
    capture.mockClear()
    buddiesState.notificationsEnabled = true
    app.applicationId = 'com.leviwilkerson.jwtimebeta'
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

  it("sends the running app's bundle id as its APNs topic", async () => {
    await registerBuddiesPush()
    expect(registerPush.mock.calls[0][0]).toMatchObject({
      apnsTopic: 'com.leviwilkerson.jwtimebeta',
    })
    app.applicationId = null
    await registerBuddiesPush()
    expect(registerPush.mock.calls[1][0]).not.toHaveProperty('apnsTopic')
  })

  it('records the registration outcome, but not an unchanged one', async () => {
    await registerBuddiesPush()
    expect(capture).toHaveBeenCalledWith('buddies_push_registration', {
      outcome: 'registered',
    })
    capture.mockClear()
    registerPush.mockResolvedValueOnce('unchanged')
    await registerBuddiesPush()
    expect(capture).not.toHaveBeenCalled()
    registerPush.mockRejectedValueOnce(new Error('boom'))
    await expect(registerBuddiesPush()).rejects.toThrow('boom')
    expect(capture).toHaveBeenCalledWith('buddies_push_registration', {
      outcome: 'failed',
      reason: 'error',
    })
  })
})
