import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  ready: false,
  initial: null as unknown,
  listener: undefined as undefined | ((response: unknown) => void),
  navigate: vi.fn(),
  openReminderTarget: vi.fn(() => true),
  requestTray: vi.fn(),
  markSeen: vi.fn(),
  sync: vi.fn(async () => {}),
  openBadgePush: vi.fn(
    (_seq: number | undefined): { id: string; inboxId: string } | null => null
  ),
  openBadgeReactionPush: vi.fn(
    (_seq: number | undefined): { id: string; badgeKey: string } | null => null
  ),
  capture: vi.fn(),
  buddiesEnabled: true,
  onboarded: true,
}))

vi.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'default',
  getLastNotificationResponse: () => runtime.initial,
  clearLastNotificationResponse: vi.fn(),
  addNotificationResponseReceivedListener: (
    listener: (response: unknown) => void
  ) => {
    runtime.listener = listener
    return { remove: vi.fn() }
  },
}))
vi.mock('@/features/contacts/lib/linking', () => ({
  navigationRef: {
    isReady: () => runtime.ready,
    navigate: runtime.navigate,
  },
}))
vi.mock('@/features/buddies/hooks/useBuddiesEnabled', () => ({
  default: () => runtime.buddiesEnabled,
}))
vi.mock('@/features/buddies/hooks/useBuddyNotifications', () => ({
  syncBuddyNotifications: runtime.sync,
  openBadgePush: runtime.openBadgePush,
  openBadgeReactionPush: runtime.openBadgeReactionPush,
}))
vi.mock('@/features/notifications/stores/notificationsTray', () => ({
  markSeen: runtime.markSeen,
  requestNotificationsTray: runtime.requestTray,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/stores/contactsStore', () => ({
  default: { getState: () => ({ contacts: [] }) },
}))
vi.mock('@/stores/conversationStore', () => ({
  default: { getState: () => ({ conversations: [] }) },
}))
vi.mock('@/stores/serviceReport', () => ({
  default: { getState: () => ({ dayPlans: [] }) },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: Object.assign(
    (select: (state: { onboardingComplete: boolean }) => unknown) =>
      select({ onboardingComplete: runtime.onboarded }),
    { getState: () => ({}) }
  ),
  DEFAULT_PLAN_NOTIFICATION_OFFSET: { amount: 30, unit: 'minutes' },
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET: { amount: 30, unit: 'minutes' },
}))
vi.mock('@/app/notifications/reminderTargets', () => ({
  openReminderTarget: runtime.openReminderTarget,
}))
vi.mock('@/app/notifications/useReminderNotifications', () => ({
  reminderTrayId: () => 'tray-id',
}))

import NotificationResponseListener from './NotificationResponseListener'
import { resetTakeovers, useTakeover } from '@/stores/takeover'

const response = (
  identifier: string,
  data: unknown,
  trigger: unknown = null
) => ({
  actionIdentifier: 'default',
  notification: {
    date: 1,
    request: { identifier, content: { data }, trigger },
  },
})

let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  runtime.ready = false
  runtime.initial = null
  runtime.buddiesEnabled = true
  runtime.onboarded = true
  resetTakeovers()
  runtime.openReminderTarget.mockReturnValue(true)
  runtime.openBadgePush.mockReturnValue(null)
  runtime.openBadgeReactionPush.mockReturnValue(null)
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

it('routes the tap that launched the app once navigation is ready', async () => {
  runtime.initial = response('launch', {
    reminder: { kind: 'visit', id: 'v', contactId: 'c' },
  })
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  expect(runtime.openReminderTarget).not.toHaveBeenCalled()
  runtime.ready = true
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  expect(runtime.openReminderTarget).toHaveBeenCalledWith({
    kind: 'visit',
    id: 'v',
    contactId: 'c',
  })
  expect(runtime.capture).toHaveBeenCalledWith('notification_opened', {
    source: 'local',
    kind: 'visit',
    cold_start: true,
  })
})

it('does not replay an already-routed launch tap on remount', async () => {
  runtime.ready = true
  runtime.initial = response('replayed', {
    reminder: { kind: 'plan', id: 'p' },
  })
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  act(() => renderer?.unmount())
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  expect(runtime.openReminderTarget).toHaveBeenCalledTimes(1)
})

it("opens the tray when a reminder's record is gone", async () => {
  runtime.ready = true
  runtime.openReminderTarget.mockReturnValue(false)
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  await act(async () => {
    runtime.listener?.(
      response('gone', { reminder: { kind: 'contact', id: 'x' } })
    )
  })
  expect(runtime.navigate).toHaveBeenCalledWith(
    'Root',
    { screen: 'Home' },
    // Back to the one Root, never a second one on top.
    { pop: true }
  )
  expect(runtime.requestTray).toHaveBeenCalled()
})

it('syncs and opens the tray for a Buddies push', async () => {
  runtime.ready = true
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  await act(async () => {
    runtime.listener?.(
      response('push', undefined, {
        type: 'push',
        payload: { ww: { kind: 'plan.invite', seq: 4 } },
      })
    )
  })
  expect(runtime.sync).toHaveBeenCalledWith('open')
  expect(runtime.requestTray).toHaveBeenCalled()
})

const badgePush = (seq: number) =>
  response(`badge-${seq}`, undefined, {
    type: 'push',
    payload: { ww: { kind: 'badge.new', seq } },
  })

it('opens the buddy a badge push is about once its event has synced', async () => {
  runtime.ready = true
  let finishSync = () => {}
  runtime.sync.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishSync = resolve
    })
  )
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  await act(async () => {
    runtime.listener?.(badgePush(7))
  })
  expect(runtime.navigate).not.toHaveBeenCalled()
  runtime.openBadgePush.mockReturnValue({ id: 'event', inboxId: 'anna' })
  await act(async () => {
    finishSync()
  })
  expect(runtime.openBadgePush).toHaveBeenLastCalledWith(7)
  expect(runtime.navigate).toHaveBeenCalledWith('Buddy', { inboxId: 'anna' })
  expect(runtime.markSeen).toHaveBeenCalledWith(['event'])
  expect(runtime.requestTray).not.toHaveBeenCalled()
})

it('opens the tray at once for a badge push without an event sequence', async () => {
  runtime.ready = true
  runtime.sync.mockReturnValueOnce(new Promise<void>(() => {}))
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  await act(async () => {
    runtime.listener?.(
      response('badge-no-seq', undefined, {
        type: 'push',
        payload: { ww: { kind: 'badge.new' } },
      })
    )
  })
  expect(runtime.openBadgePush).not.toHaveBeenCalled()
  expect(runtime.requestTray).toHaveBeenCalled()
})

it('falls back to the tray when a badge push finds nothing to open', async () => {
  runtime.ready = true
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  await act(async () => {
    runtime.listener?.(badgePush(8))
  })
  expect(runtime.navigate).toHaveBeenCalledWith(
    'Root',
    { screen: 'Home' },
    // Back to the one Root, never a second one on top.
    { pop: true }
  )
  expect(runtime.requestTray).toHaveBeenCalled()
})

it('opens my badge a reaction push is about once its event has synced', async () => {
  runtime.ready = true
  let finishSync = () => {}
  runtime.sync.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishSync = resolve
    })
  )
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  await act(async () => {
    runtime.listener?.(
      response('reaction-9', undefined, {
        type: 'push',
        payload: { ww: { kind: 'badge.reaction', seq: 9 } },
      })
    )
  })
  expect(runtime.navigate).not.toHaveBeenCalled()
  runtime.openBadgeReactionPush.mockReturnValue({
    id: 'reaction',
    badgeKey: 'yearRound.3',
  })
  await act(async () => {
    finishSync()
  })
  expect(runtime.openBadgeReactionPush).toHaveBeenLastCalledWith(9)
  expect(runtime.openBadgePush).not.toHaveBeenCalled()
  expect(runtime.navigate).toHaveBeenCalledWith('BadgeView', {
    badgeKey: 'yearRound.3',
    owner: 'me',
  })
  expect(runtime.markSeen).toHaveBeenCalledWith(['reaction'])
  expect(runtime.requestTray).not.toHaveBeenCalled()
})

it('falls back to the tray when a reaction push finds nothing to open', async () => {
  runtime.ready = true
  await act(async () => {
    renderer = create(<NotificationResponseListener />)
  })
  await act(async () => {
    runtime.listener?.(
      response('reaction-10', undefined, {
        type: 'push',
        payload: { ww: { kind: 'badge.reaction', seq: 10 } },
      })
    )
  })
  expect(runtime.navigate).toHaveBeenCalledWith(
    'Root',
    { screen: 'Home' },
    // Back to the one Root, never a second one on top.
    { pop: true }
  )
  expect(runtime.requestTray).toHaveBeenCalled()
})

describe('waits for what is taking over the screen (ADR 0021)', () => {
  it('routes a tap only after the update reveal closes', async () => {
    runtime.ready = true
    const reveal = useTakeover.getState().seed('update-reveal')
    await act(async () => {
      renderer = create(<NotificationResponseListener />)
    })
    await act(async () => {
      runtime.listener?.(
        response('during-reveal', { reminder: { kind: 'plan', id: 'p' } })
      )
    })
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(runtime.openReminderTarget).not.toHaveBeenCalled()
    // Waiting holds every other takeover off, so the tap goes next.
    expect(useTakeover.getState().arbiter.holds).toContain('navigation')
    await act(async () => {
      useTakeover.getState().release(reveal)
    })
    expect(runtime.openReminderTarget).toHaveBeenCalledWith({
      kind: 'plan',
      id: 'p',
    })
    expect(useTakeover.getState().arbiter.holds).not.toContain('navigation')
  })

  it('opens the tray for a Buddies push only after the reveal', async () => {
    runtime.ready = true
    const reveal = useTakeover.getState().seed('update-reveal')
    await act(async () => {
      renderer = create(<NotificationResponseListener />)
    })
    await act(async () => {
      runtime.listener?.(
        response('push-during-reveal', undefined, {
          type: 'push',
          payload: { ww: { kind: 'share.reply', seq: 3 } },
        })
      )
    })
    expect(runtime.requestTray).not.toHaveBeenCalled()
    expect(runtime.navigate).not.toHaveBeenCalled()
    await act(async () => {
      useTakeover.getState().release(reveal)
    })
    expect(runtime.navigate).toHaveBeenCalledWith(
      'Root',
      { screen: 'Home' },
      // Back to the one Root, never a second one on top.
      { pop: true }
    )
    expect(runtime.requestTray).toHaveBeenCalled()
  })

  it('waits for onboarding to finish', async () => {
    runtime.ready = true
    runtime.onboarded = false
    runtime.initial = response('during-onboarding', {
      reminder: { kind: 'visit', id: 'v', contactId: 'c' },
    })
    await act(async () => {
      renderer = create(<NotificationResponseListener />)
    })
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(runtime.openReminderTarget).not.toHaveBeenCalled()
    runtime.onboarded = true
    await act(async () => {
      renderer?.update(<NotificationResponseListener />)
    })
    expect(runtime.openReminderTarget).toHaveBeenCalledTimes(1)
  })
})
