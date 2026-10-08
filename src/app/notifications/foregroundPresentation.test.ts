import { describe, expect, it, vi } from 'vitest'
import type * as Notifications from 'expo-notifications'

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4, LOW: 2 },
  AndroidNotificationPriority: { LOW: 'low', DEFAULT: 'default' },
}))

import {
  foregroundPresentation,
  isBuddiesNews,
} from '@/app/notifications/foregroundPresentation'

/** A Buddies push as iOS delivers it: the marker rides on the trigger. */
const push = (kind: string) =>
  ({
    request: {
      identifier: kind,
      content: { data: {} },
      trigger: { type: 'push', payload: { ww: { kind, seq: 4 } } },
    },
  }) as unknown as Notifications.Notification

/** The same on Android, in the content's data. */
const androidPush = (kind: string) =>
  ({
    request: {
      identifier: kind,
      content: { data: { ww: { kind } } },
      trigger: null,
    },
  }) as unknown as Notifications.Notification

const reminder = {
  request: {
    identifier: 'r',
    content: { data: { reminder: { kind: 'plan', id: 'p' } } },
    trigger: null,
  },
} as unknown as Notifications.Notification

describe("buddies' news in the foreground (ADR 0021)", () => {
  it.each([push, androidPush])(
    'lists new badges and reactions without a banner or sound',
    (make) => {
      for (const kind of ['badge.new', 'badge.reaction']) {
        expect(isBuddiesNews(make(kind))).toBe(true)
        expect(
          foregroundPresentation(make(kind), { audioEnabled: true })
        ).toEqual({
          shouldShowAlert: false,
          shouldShowBanner: false,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          priority: 'low',
        })
      }
    }
  )

  it('still shows logistics and reminders as banners', () => {
    for (const notification of [
      push('pair.confirmed'),
      push('plan.invite'),
      androidPush('share.reply'),
      reminder,
    ]) {
      expect(isBuddiesNews(notification)).toBe(false)
      expect(
        foregroundPresentation(notification, { audioEnabled: false })
      ).toMatchObject({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      })
    }
    expect(
      foregroundPresentation(reminder, { audioEnabled: true }).shouldPlaySound
    ).toBe(true)
  })
})
