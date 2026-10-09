import { beforeEach, describe, expect, it, vi } from 'vitest'

const { describePush, schedule, setChannel, setNewsChannel, record, platform } =
  vi.hoisted(() => ({
    describePush: vi.fn(),
    schedule: vi.fn(async (_request: unknown) => 'id'),
    setChannel: vi.fn(async () => null),
    setNewsChannel: vi.fn(async () => undefined),
    record: vi.fn(),
    platform: { OS: 'android' as 'android' | 'ios' },
  }))

vi.mock('react-native', () => ({ Platform: platform }))
vi.mock('expo-notifications', () => ({ scheduleNotificationAsync: schedule }))
vi.mock('@/features/buddies/lib/pushRegistration', () => ({
  BUDDIES_CHANNEL_ID: 'buddies',
  BUDDIES_NEWS_CHANNEL_ID: 'buddies_news',
  ensureBuddiesChannel: setChannel,
  ensureBuddiesNewsChannel: setNewsChannel,
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/features/buddies/lib/buddiesService', () => ({
  buddiesEngine: { describePush },
}))
vi.mock('@/app/buddies/buddiesAlertOutcomes', async (original) => ({
  ...(await original<typeof import('@/app/buddies/buddiesAlertOutcomes')>()),
  recordAlertOutcome: record,
}))
vi.mock('@/features/buddies/lib/pushAlertText', () => ({
  buddyAlertText: (alert: { type: string; name: string }) => ({
    title: `${alert.name}: ${alert.type}`,
    body: 'Sat, Sep 26 · 10:00 AM',
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('../../../modules/buddies-keychain', () => ({}))
vi.mock('@/stores/mmkv', () => ({ mmkvStorage: {} }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))

const { postBuddiesAlert } = await import('@/app/buddies/buddiesPushAlerts')

const marker = {
  kind: 'plan.invite',
  seq: 12,
  eventId: 'AAAAAAAAAAAAAAAAAAAAAA',
  blob: 'AQAB',
}
/** FCM's data keys, as the relay sends them now. */
const data = (overrides: Record<string, unknown> = {}) => ({
  fallbackTitle: 'New invitation',
  fallbackBody: 'A buddy invited you to a Plan.',
  body: JSON.stringify({ ww: marker }),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  platform.OS = 'android'
})

describe('postBuddiesAlert', () => {
  it('posts the named alert in the Buddies channel, routed like the push', async () => {
    describePush.mockResolvedValue({ alert: { type: 'share', name: 'Anna' } })
    await postBuddiesAlert(data())

    expect(describePush).toHaveBeenCalledWith(marker, {
      signal: expect.any(AbortSignal),
    })
    expect(setChannel).toHaveBeenCalled()
    expect(schedule).toHaveBeenCalledWith({
      identifier: 'buddies-12',
      content: {
        title: 'Anna: share',
        body: 'Sat, Sep 26 · 10:00 AM',
        data: { ww: { kind: 'plan.invite', seq: 12 } },
      },
      trigger: { channelId: 'buddies' },
    })
    expect(record).toHaveBeenCalledWith('named')
  })

  it("posts the template text when the event can't be opened", async () => {
    describePush.mockResolvedValue({ failed: 'unknownSender' })
    await postBuddiesAlert(data())

    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: {
          title: 'New invitation',
          body: 'A buddy invited you to a Plan.',
          data: { ww: { kind: 'plan.invite', seq: 12 } },
        },
      })
    )
    expect(record).toHaveBeenCalledWith('fallback.unknownSender')
  })

  it('falls back when opening it throws or takes too long', async () => {
    describePush.mockRejectedValue(new Error('offline'))
    await postBuddiesAlert(data())
    expect(schedule).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith('fallback.error')

    vi.useFakeTimers()
    try {
      describePush.mockReturnValue(new Promise(() => undefined))
      const posting = postBuddiesAlert(data())
      await vi.advanceTimersByTimeAsync(10_000)
      await posting
      expect(schedule).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("posts a buddy's badge news in the quiet channel", async () => {
    describePush.mockResolvedValue({ alert: { type: 'badge', name: 'Levi' } })
    await postBuddiesAlert(
      data({
        body: JSON.stringify({ ww: { ...marker, kind: 'badge.new' } }),
      })
    )

    expect(setNewsChannel).toHaveBeenCalled()
    expect(setChannel).not.toHaveBeenCalled()
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          data: { ww: { kind: 'badge.new', seq: 12 } },
        }),
        trigger: { channelId: 'buddies_news' },
      })
    )
  })

  it('posts nothing for a push muted here', async () => {
    describePush.mockResolvedValue({ quiet: true })
    await postBuddiesAlert(data())
    expect(schedule).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledWith('quiet')
  })

  it('leaves alerts the system already showed, and anything not Buddies', async () => {
    // A relay from before named alerts: expo-notifications shows its title.
    await postBuddiesAlert(
      data({ title: 'New invitation', message: 'A buddy invited you.' })
    )
    await postBuddiesAlert({ body: JSON.stringify({ reminder: {} }) })
    platform.OS = 'ios'
    await postBuddiesAlert(data())
    expect(describePush).not.toHaveBeenCalled()
    expect(schedule).not.toHaveBeenCalled()
  })
})
