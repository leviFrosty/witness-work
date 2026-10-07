import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * HomeTabStack's takeover hosts with the real arbiter, the real host logic and
 * the real holds, and every takeover's visuals stubbed out as a host element
 * named after it. After every step of fake time, at most one takeover may be
 * mounted (ADR 0021).
 */

const runtime = vi.hoisted(() => ({
  focused: true,
  appState: 'active' as string,
  appStateListener: undefined as undefined | ((state: string) => void),
  navigate: vi.fn(),
  capture: vi.fn(),
  streak: { kind: 'plans', count: 4, latest: '2026-10-06' } as {
    kind: 'plans' | 'months'
    count: number
    latest: string | null
  },
}))

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return runtime.appState
    },
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appStateListener = listener
      return { remove: () => (runtime.appStateListener = undefined) }
    },
  },
  Platform: { OS: 'ios' },
}))
vi.mock('@react-navigation/native', () => ({
  useIsFocused: () => runtime.focused,
  useNavigationState: (
    select: (state: { index: number; routes: { name: string }[] }) => unknown
  ) =>
    select({
      index: 0,
      routes: [{ name: runtime.focused ? 'Root' : 'Add Time' }],
    }),
  useNavigation: () => ({ navigate: runtime.navigate }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/lib/haptics', () => ({
  default: { light: async () => {}, success: async () => {} },
}))
vi.mock('@/stores/mmkv', () => ({
  MmkvStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
}))
vi.mock('@/hooks/useServiceStreak', () => ({
  default: () => runtime.streak,
}))
vi.mock('@/stores/preferences', async () => {
  const { create } = await import('zustand')
  type Prefs = {
    badgesWelcome: 'pending' | 'done' | null
    showBadges: boolean
    badgeCardDismissed: string[]
    set: (patch: Partial<Prefs>) => void
    dismissBadgeCard: (keys: string[]) => void
  }
  const usePreferences = create<Prefs>((set) => ({
    badgesWelcome: null,
    showBadges: true,
    badgeCardDismissed: [],
    set: (patch) => set(patch),
    dismissBadgeCard: (keys) =>
      set((s) => ({ badgeCardDismissed: [...s.badgeCardDismissed, ...keys] })),
  }))
  return { usePreferences }
})
vi.mock('@/features/notifications/stores/notificationsTray', async () => {
  const { create } = await import('zustand')
  return { useNotificationsTray: create(() => ({ open: false })) }
})

// The visuals: each renders a host element named after its takeover.
const { stub, stubWhenShown } = vi.hoisted(() => {
  const { createElement } = require('react') as typeof import('react')
  return {
    stub: (name: string) => (props: Record<string, unknown>) =>
      createElement(name, props),
    stubWhenShown: (name: string) => (props: { show: boolean }) =>
      props.show ? createElement(name, props) : null,
  }
})
vi.mock('@/features/updates/components/reveal/UpdateRevealOverlay', () => ({
  default: stub('update-reveal'),
}))
vi.mock('@/features/updates/components/WhatsNewSheet', () => ({
  default: stubWhenShown('whats-new'),
}))
vi.mock('@/features/milestones/components/MilestoneRevealOverlay', () => ({
  default: stubWhenShown('milestone-reveal'),
}))
vi.mock(
  '@/features/plans/components/schedule-intro/ScheduleIntroOverlay',
  () => ({ default: stub('schedule-intro') })
)
vi.mock('@/features/profile/components/StreakCelebrationOverlay', () => ({
  default: stub('streak-celebration'),
}))
vi.mock('@/features/badges/components/BadgeCelebration', () => ({
  default: stub('badge-celebration'),
}))
vi.mock('@/features/badges/components/BadgesWelcome', () => ({
  default: stub('badges-welcome'),
}))

import TakeoverEnvironment from '@/app/takeover/TakeoverEnvironment'
import TakeoverHosts from '@/app/takeover/TakeoverHosts'
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'
import { useUpdateRevealStore } from '@/features/updates/stores/updateReveal'
import { noteUserAction, resetUserActions } from '@/lib/userAction'
import { useBadgeSession } from '@/stores/badgeSession'
import { usePreferences } from '@/stores/preferences'
import { useProfileOverlay } from '@/stores/profileOverlay'
import { useScheduleIntro } from '@/stores/scheduleIntro'
import { resetTakeovers, useTakeover } from '@/stores/takeover'

const TAKEOVERS = [
  'update-reveal',
  'whats-new',
  'milestone-reveal',
  'schedule-intro',
  'streak-celebration',
  'badge-celebration',
  'badges-welcome',
]

let renderer: ReactTestRenderer | undefined

/** The takeovers on screen right now; never more than one. */
const onScreen = () => {
  const mounted = TAKEOVERS.filter(
    (name) => (renderer?.root.findAllByType(name as never).length ?? 0) > 0
  )
  expect(mounted.length).toBeLessThanOrEqual(1)
  return mounted[0] ?? null
}

const props = (name: string) =>
  renderer!.root.findByType(name as never).props as Record<
    string,
    (...args: unknown[]) => void
  >

/** Advances fake time in small steps, checking the one-at-a-time rule. */
async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    await act(async () => {
      vi.advanceTimersByTime(Math.min(100, ms - elapsed))
    })
    onScreen()
  }
}

const tree = (launchReveal = false) => (
  <>
    <TakeoverEnvironment />
    <TakeoverHosts launchReveal={launchReveal} />
  </>
)

async function rerender() {
  await act(async () => renderer?.update(tree()))
}

async function mount(launchReveal = false) {
  await act(async () => {
    renderer = create(tree(launchReveal))
  })
  onScreen()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 8, 12))
  vi.clearAllMocks()
  resetTakeovers()
  resetUserActions()
  runtime.focused = true
  runtime.appState = 'active'
  runtime.streak = { kind: 'plans', count: 4, latest: '2026-10-06' }
  useBadgeSession.getState().reset()
  useStreakCelebration.setState({ seen: null, celebrating: null, grewAt: 0 })
  useScheduleIntro.setState({ source: null })
  useUpdateRevealStore.setState({ source: null })
  useProfileOverlay.setState({ open: false, origin: null })
  usePreferences.setState({
    badgesWelcome: null,
    showBadges: true,
    badgeCardDismissed: [],
  })
})
afterEach(async () => {
  await act(async () => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

describe('takeover hosts (ADR 0021)', () => {
  it('plays an update launch one takeover at a time, in order', async () => {
    // Everything wants the screen in the first session after the update.
    usePreferences.setState({ badgesWelcome: 'pending' })
    useStreakCelebration.setState({
      celebrating: { count: 10, kind: 'plans' },
    })
    useScheduleIntro.getState().open('first_visit')
    useBadgeSession.getState().addHistory(3)
    await mount(true)
    expect(onScreen()).toBe('update-reveal')
    await advance(10_000)
    expect(onScreen()).toBe('update-reveal')

    // The reveal closes; after the gap, the Schedule intro.
    await act(async () => props('update-reveal').onClosed())
    expect(onScreen()).toBeNull()
    await advance(600)
    expect(onScreen()).toBeNull()
    await advance(200)
    expect(onScreen()).toBe('schedule-intro')
    await act(async () => useScheduleIntro.getState().close())
    await advance(800)

    // Then the streak (a preview, with no action to expire with).
    expect(onScreen()).toBe('streak-celebration')
    await act(async () => props('streak-celebration').onDone())
    await advance(800)

    // The welcome waits for a launch without the reveal; the summary waits
    // for the welcome, so nothing else this launch.
    await advance(30_000)
    expect(onScreen()).toBeNull()
    expect(usePreferences.getState().badgesWelcome).toBe('pending')
  })

  it('waits behind the open profile overlay after "Take a look"', async () => {
    usePreferences.setState({ badgesWelcome: 'pending' })
    useProfileOverlay.getState().setOrigin({ x: 0, y: 0, width: 1, height: 1 })
    await mount()
    await advance(800)
    expect(onScreen()).toBe('badges-welcome')
    // A streak milestone comes in behind it.
    await act(async () => {
      useStreakCelebration.setState({
        celebrating: { count: 10, kind: 'plans' },
      })
    })
    await advance(2000)
    expect(onScreen()).toBe('badges-welcome')

    // "Take a look" opens the profile in the same tick the welcome closes.
    await act(async () => props('badges-welcome').onClose('look'))
    expect(useProfileOverlay.getState().open).toBe(true)
    await advance(20_000)
    expect(onScreen()).toBeNull()

    await act(async () => useProfileOverlay.getState().close())
    await advance(600)
    expect(onScreen()).toBeNull()
    await advance(200)
    expect(onScreen()).toBe('streak-celebration')
  })

  it("celebrates the User's own action once", async () => {
    await mount()
    // Add Time: the streak reaches a milestone...
    const action = noteUserAction('time')
    runtime.streak = { kind: 'plans', count: 5, latest: '2026-10-08' }
    await rerender()
    await advance(1000)
    expect(onScreen()).toBe('streak-celebration')
    // ...and the badge the same save earned goes quiet (the Home card).
    await act(async () =>
      useBadgeSession.getState().celebrate(['reportSent.1'], {
        group: `action:${action.id}`,
        expiresAt: action.at + 15_000,
      })
    )
    await advance(200)
    expect(useBadgeSession.getState().celebrations).toEqual([])
    await act(async () => props('streak-celebration').onDone())
    await advance(5000)
    expect(onScreen()).toBeNull()
  })

  it('flares the chip for growth nobody here caused', async () => {
    await mount()
    // Another device's entry lands; the User last did something a minute ago.
    noteUserAction('visit')
    await advance(60_000)
    runtime.streak = { kind: 'plans', count: 5, latest: '2026-10-08' }
    await rerender()
    await advance(2000)
    expect(onScreen()).toBeNull()
    expect(useStreakCelebration.getState().grewAt).toBeGreaterThan(0)
  })

  it('expires a celebration held past its moment', async () => {
    runtime.focused = false // Add Time is still on top of the tabs.
    await mount()
    const action = noteUserAction('time')
    await act(async () =>
      useBadgeSession.getState().celebrate(['reportSent.1'], {
        group: `action:${action.id}`,
        expiresAt: action.at + 15_000,
      })
    )
    await advance(16_000)
    expect(onScreen()).toBeNull()
    expect(useBadgeSession.getState().celebrations).toEqual([])
    runtime.focused = true
    await rerender()
    await advance(2000)
    expect(onScreen()).toBeNull()
  })

  it('drops a waiting celebration when the app goes to the background', async () => {
    runtime.focused = false
    await mount()
    const action = noteUserAction('time')
    await act(async () =>
      useBadgeSession.getState().celebrate(['reportSent.1'], {
        group: `action:${action.id}`,
        expiresAt: action.at + 15_000,
      })
    )
    await act(async () => runtime.appStateListener?.('background'))
    await advance(200)
    expect(useBadgeSession.getState().celebrations).toEqual([])
  })

  it('lets a replay of the reveal through, and nothing over it', async () => {
    useProfileOverlay.getState().show({ x: 0, y: 0, width: 1, height: 1 })
    await mount()
    await act(async () => useUpdateRevealStore.getState().request('tray'))
    // The User asked for it: it shows even over a hold.
    expect(onScreen()).toBe('update-reveal')
    await act(async () =>
      useBadgeSession.getState().celebrate(['reportSent.1'])
    )
    await act(async () => {
      useStreakCelebration.setState({
        celebrating: { count: 10, kind: 'plans' },
      })
    })
    await act(async () => useProfileOverlay.getState().close())
    await advance(5000)
    expect(onScreen()).toBe('update-reveal')
    expect(useTakeover.getState().arbiter.queue).toHaveLength(2)
  })
})
