import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BADGE_PUSH_KIND,
  BADGE_REACTION_PUSH_KIND,
  BUDDY_PUSH_KINDS,
} from '@/features/buddies/lib/engine'
import {
  BUDDIES_NEWS_CHANNEL_ID,
  ensureBuddiesNewsChannel,
  registerBuddiesPush,
} from '@/features/buddies/lib/pushRegistration'

const {
  registerPush,
  joinKinds,
  badgeKinds,
  buddiesState,
  app,
  capture,
  platform,
  setChannel,
} = vi.hoisted(() => ({
  registerPush: vi.fn(
    async (_device: {
      apnsEnvironment?: string
      apnsTopic?: string
      pushService?: string
      fcmToken?: string
      templates: Record<string, unknown>
    }) => 'registered'
  ),
  joinKinds: { current: ['join.request.aaaaaaaaaaaa'] },
  badgeKinds: { current: ['badge.new', 'badge.reaction'] },
  buddiesState: { registeredInboxId: 'inbox', notificationsEnabled: true },
  app: { applicationId: 'com.leviwilkerson.jwtimebeta' as string | null },
  capture: vi.fn(),
  platform: { OS: 'ios' as 'ios' | 'android' },
  setChannel: vi.fn(async () => null),
}))

vi.mock('react-native', () => ({ Platform: platform }))
vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4, LOW: 2 },
  getPermissionsAsync: async () => ({ granted: true }),
  getDevicePushTokenAsync: async () => ({ data: 'token' }),
  setNotificationChannelAsync: setChannel,
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
    badgePushKinds: () => badgeKinds.current,
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
    badgeKinds.current = [BADGE_PUSH_KIND, BADGE_REACTION_PUSH_KIND]
    app.applicationId = 'com.leviwilkerson.jwtimebeta'
    platform.OS = 'ios'
    setChannel.mockClear()
  })

  it('registers a localized template for every Buddies push kind', async () => {
    await registerBuddiesPush()
    const { templates, apnsEnvironment } = registerPush.mock.calls[0][0]
    expect(apnsEnvironment).toBe('sandbox')
    // iOS sends what builds before Android sent: no push service field.
    expect(registerPush.mock.calls[0][0]).not.toHaveProperty('pushService')
    expect(setChannel).not.toHaveBeenCalled()
    expect(Object.keys(templates).sort()).toEqual(
      [
        ...BUDDY_PUSH_KINDS,
        ...joinKinds.current,
        BADGE_PUSH_KIND,
        BADGE_REACTION_PUSH_KIND,
      ].sort()
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
      [...BUDDY_PUSH_KINDS, BADGE_PUSH_KIND, BADGE_REACTION_PUSH_KIND].sort()
    )
  })

  it('stays within the relay’s 32 templates with five buddies and badge alerts', async () => {
    joinKinds.current = ['a', 'b', 'c', 'd', 'e'].map(
      (tag) => `join.request.${tag.repeat(12)}`
    )
    await registerBuddiesPush()
    const { templates } = registerPush.mock.calls[0][0]
    // Nine fixed kinds, five join kinds, and the two badge kinds.
    expect(BUDDY_PUSH_KINDS).toHaveLength(9)
    expect(Object.keys(templates)).toHaveLength(16)
    expect(Object.keys(templates).length).toBeLessThanOrEqual(32)
  })

  it('registers generic, name-free templates for new badges and reactions only while badge alerts are on', async () => {
    await registerBuddiesPush()
    const { templates } = registerPush.mock.calls[0][0]
    expect(templates[BADGE_PUSH_KIND]).toEqual({
      title: 'buddies_pushBadgeTitle',
      body: 'buddies_pushBadgeBody',
    })
    expect(templates[BADGE_REACTION_PUSH_KIND]).toEqual({
      title: 'buddies_pushBadgeReactionTitle',
      body: 'buddies_pushBadgeBody',
    })
    // Badge alerts (or badges) off on this device.
    badgeKinds.current = []
    await registerBuddiesPush()
    expect(registerPush.mock.calls[1][0].templates).not.toHaveProperty(
      BADGE_PUSH_KIND
    )
    expect(registerPush.mock.calls[1][0].templates).not.toHaveProperty(
      BADGE_REACTION_PUSH_KIND
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

  it('registers an FCM token on Android, after creating the Buddies channel', async () => {
    platform.OS = 'android'
    await registerBuddiesPush()
    const device = registerPush.mock.calls[0][0]
    expect(device).toMatchObject({ pushService: 'fcm', fcmToken: 'token' })
    expect(device).not.toHaveProperty('apnsToken')
    expect(device).not.toHaveProperty('apnsTopic')
    // Badge alerts register on Android too, now that Buddies is there.
    expect(Object.keys(device.templates).sort()).toEqual(
      [...BUDDY_PUSH_KINDS, ...joinKinds.current, ...badgeKinds.current].sort()
    )
    expect(setChannel).toHaveBeenCalledWith('buddies', {
      name: 'buddies_title',
      importance: 4,
    })
    // Buddies' news gets its own quiet channel, made at the same time.
    expect(setChannel).toHaveBeenCalledWith('buddies_news', {
      name: 'buddies_newsChannelName',
      importance: 2,
    })
  })
})

describe("buddies' news channel (ADR 0021)", () => {
  it('is low importance', async () => {
    setChannel.mockClear()
    expect(BUDDIES_NEWS_CHANNEL_ID).toBe('buddies_news')
    await ensureBuddiesNewsChannel()
    expect(setChannel).toHaveBeenCalledWith('buddies_news', {
      name: 'buddies_newsChannelName',
      importance: 2,
    })
  })
})
