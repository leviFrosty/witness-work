import { describe, expect, it, vi } from 'vitest'
import type * as Notifications from 'expo-notifications'

vi.mock('react-native', () => ({
  AppState: { currentState: 'background' },
  Platform: { OS: 'android' },
}))
vi.mock('expo-notifications', () => ({
  BackgroundNotificationTaskResult: { NoData: 1, NewData: 2, Failed: 3 },
  registerTaskAsync: vi.fn(async () => undefined),
}))
vi.mock('../../../modules/buddies-keychain', () => ({
  isAvailable: () => true,
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
const { sync, postBuddiesAlert, defineTask, calls } = vi.hoisted(() => {
  const calls: string[] = []
  return {
    calls,
    sync: vi.fn(async () => {
      calls.push('sync')
    }),
    postBuddiesAlert: vi.fn(async () => {
      calls.push('alert')
    }),
    defineTask: vi.fn(),
  }
})
vi.mock('expo-task-manager', () => ({
  isTaskDefined: () => false,
  defineTask,
}))
vi.mock('@/features/buddies/lib/buddiesService', () => ({
  buddiesEngine: { sync },
}))
vi.mock('@/app/buddies/buddiesPushAlerts', () => ({ postBuddiesAlert }))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: { getState: () => ({ registeredInboxId: 'inbox', syncSeq: 0 }) },
}))

const { isBuddiesPush } = await import('./buddiesBackgroundSync')

const payload = (data: Record<string, unknown>) =>
  ({ notification: null, data }) as Notifications.NotificationTaskPayload

describe('isBuddiesPush', () => {
  it('finds the marker among the APNs payload keys (iOS)', () => {
    expect(isBuddiesPush(payload({ ww: { kind: 'plan.invite' } }))).toBe(true)
  })

  it('finds the marker in the FCM data JSON (Android)', () => {
    expect(
      isBuddiesPush(
        payload({
          title: 'Plans',
          message: 'An invitation',
          channelId: 'buddies',
          body: JSON.stringify({ ww: { kind: 'plan.invite' } }),
          dataString: JSON.stringify({ ww: { kind: 'plan.invite' } }),
        })
      )
    ).toBe(true)
  })

  it('ignores other pushes, unreadable data, and notification taps', () => {
    expect(isBuddiesPush(payload({ dataString: '{"reminder":{}}' }))).toBe(
      false
    )
    expect(isBuddiesPush(payload({ dataString: 'not json' }))).toBe(false)
    expect(isBuddiesPush(payload({ dataString: 'null' }))).toBe(false)
    expect(
      isBuddiesPush({
        actionIdentifier: 'default',
        notification: {},
      } as unknown as Notifications.NotificationTaskPayload)
    ).toBe(false)
  })
})

describe('the background push task', () => {
  const run = (data: Record<string, unknown>) => {
    const [[, task]] = defineTask.mock.calls as unknown as [
      [string, (body: { data: unknown }) => Promise<unknown>],
    ]
    return task({ data: payload(data) })
  }

  it("posts the push's alert, then syncs what it announced", async () => {
    calls.length = 0
    const data = {
      fallbackTitle: 'New invitation',
      body: JSON.stringify({ ww: { kind: 'plan.invite', seq: 3 } }),
    }
    await run(data)
    expect(postBuddiesAlert).toHaveBeenCalledWith(data)
    expect(calls).toEqual(['alert', 'sync'])
  })

  it('still syncs when posting the alert fails', async () => {
    calls.length = 0
    postBuddiesAlert.mockRejectedValueOnce(new Error('boom'))
    await run({ dataString: JSON.stringify({ ww: { kind: 'badge.new' } }) })
    expect(calls).toEqual(['sync'])
  })
})
