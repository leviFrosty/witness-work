import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUDDY_PUSH_KINDS } from '@/features/buddies/lib/engine'
import { registerBuddiesPush } from '@/features/buddies/lib/pushRegistration'

const { registerPush, joinKinds, buddiesState, app, capture } = vi.hoisted(
  () => ({
    registerPush: vi.fn(
      async (_device: {
        apnsEnvironment: string
        apnsTopic?: string
        templates: Record<string, unknown>
      }) => 'registered'
    ),
    joinKinds: { current: ['join.request.aaaaaaaaaaaa'] },
    buddiesState: { registeredInboxId: 'inbox', notificationsEnabled: true },
    app: { applicationId: 'com.leviwilkerson.jwtimebeta' as string | null },
    capture: vi.fn(),
  })
)

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
  buddiesEngine: {
    registerPush,
    joinRequestPushKinds: () => joinKinds.current,
  },
}))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: { getState: () => buddiesState },
}))

describe('registerBuddiesPush', () => {
  beforeEach(() => {
    registerPush.mockClear()
    capture.mockClear()
    buddiesState.notificationsEnabled = true
    joinKinds.current = ['join.request.aaaaaaaaaaaa']
    app.applicationId = 'com.leviwilkerson.jwtimebeta'
  })

  it('registers a localized template for every Buddies push kind', async () => {
    await registerBuddiesPush()
    const { templates, apnsEnvironment } = registerPush.mock.calls[0][0]
    expect(apnsEnvironment).toBe('sandbox')
    expect(Object.keys(templates).sort()).toEqual(
      [...BUDDY_PUSH_KINDS, ...joinKinds.current].sort()
    )
    // The relay accepts at most 32 templates per device.
    expect(Object.keys(templates).length).toBeLessThanOrEqual(32)
    for (const template of Object.values(templates))
      expect(template).toEqual({
        title: expect.stringMatching(/^buddies_push/),
        body: expect.stringMatching(/^buddies_push/),
      })
  })

  it('adds one template per buddy whose requests to join may alert here', async () => {
    joinKinds.current = [
      'join.request.aaaaaaaaaaaa',
      'join.request.bbbbbbbbbbbb',
    ]
    await registerBuddiesPush()
    const { templates } = registerPush.mock.calls[0][0]
    expect(templates).toMatchObject({
      'join.request.aaaaaaaaaaaa': {
        title: 'buddies_pushJoinRequestTitle',
        body: 'buddies_pushJoinRequestBody',
      },
      'join.request.bbbbbbbbbbbb': { title: 'buddies_pushJoinRequestTitle' },
    })
    // Every buddy muted, or join requests off on this device.
    joinKinds.current = []
    await registerBuddiesPush()
    expect(Object.keys(registerPush.mock.calls[1][0].templates).sort()).toEqual(
      [...BUDDY_PUSH_KINDS].sort()
    )
  })

  it('moves on from a registration that hangs, so the next one goes through', async () => {
    vi.useFakeTimers()
    try {
      registerPush.mockReturnValueOnce(new Promise(() => {}))
      const hung = registerBuddiesPush()
      const next = registerBuddiesPush()
      const timedOut = expect(hung).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(30_000)
      await timedOut
      await next
      expect(registerPush).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
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
