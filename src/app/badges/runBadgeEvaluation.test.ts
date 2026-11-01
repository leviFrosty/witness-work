import moment from 'moment'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EarnedBadge } from '@/types/badges'

const runtime = vi.hoisted(() => ({
  prefs: {} as Record<string, unknown>,
  capture: vi.fn(),
  announce: vi.fn(async (_keys: string[]) => {}),
  unlocks: vi.fn((_keys: string[], _expiresAt?: number) => {}),
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/features/badges/lib/badgeToasts', () => ({
  showBadgeUnlockToasts: runtime.unlocks,
}))
vi.mock('@/features/buddies/lib/buddiesService', () => ({
  buddiesEngine: { announceBadges: runtime.announce },
}))
vi.mock('@/features/buddies/lib/badgeEvidence', () => ({
  buddyTogetherMonths: () => [],
}))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: { getState: () => ({ buddies: [] }) },
}))
vi.mock('@/stores/conversationStore', () => ({
  useConversations: { getState: () => ({ conversations: [] }) },
}))
vi.mock('@/stores/serviceReport', () => ({
  useServiceReport: {
    getState: () => ({ serviceReports: {}, dayPlans: [], recurringPlans: [] }),
  },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => runtime.prefs },
}))

import { runBadgeEvaluation } from '@/app/badges/runBadgeEvaluation'
import { homeCardBadges } from '@/lib/badges/display'
import {
  actionBehind,
  CELEBRATION_WINDOW_MS,
  noteUserAction,
  resetUserActions,
} from '@/lib/userAction'
import { useBadgeSession } from '@/stores/badgeSession'

const NOW = new Date(2026, 9, 8, 12)
const thisMonth = moment(NOW).format('YYYY-MM')

function setUp({ showBadges = true, firstPass = false } = {}) {
  const prefs = {
    earnedBadges: {} as Record<string, EarnedBadge>,
    badgeLedger: [] as string[],
    submittedReportMonths: [thisMonth],
    badgesBackfilledAt: firstPass
      ? (null as number | null)
      : NOW.getTime() - 86_400_000,
    badgesWelcome: firstPass ? (null as string | null) : 'done',
    badgesSeenAt: 0,
    badgeCardDismissed: [] as string[],
    showBadges,
    recordBadges: ({
      earned,
      ledger,
      backfilledAt,
      welcome,
    }: {
      earned: { key: string; record: EarnedBadge }[]
      ledger: string[]
      backfilledAt?: number
      welcome?: string
    }) => {
      for (const { key, record } of earned) prefs.earnedBadges[key] ??= record
      prefs.badgeLedger = [...prefs.badgeLedger, ...ledger]
      if (backfilledAt) prefs.badgesBackfilledAt ??= backfilledAt
      if (welcome) prefs.badgesWelcome = welcome
    },
    markBadgesSeen: vi.fn(),
  }
  runtime.prefs = prefs
  return prefs
}

const card = (prefs: ReturnType<typeof setUp>) =>
  homeCardBadges({
    earned: prefs.earnedBadges,
    seenAt: prefs.badgesSeenAt,
    dismissed: prefs.badgeCardDismissed,
    waiting: useBadgeSession.getState().celebrations,
    now: NOW.getTime(),
  })

beforeEach(() => {
  vi.clearAllMocks()
  resetUserActions()
  useBadgeSession.getState().reset()
})

describe('runBadgeEvaluation: the action rule (ADR 0021)', () => {
  it("shows an unlock toast for a badge the User just earned, for its action's moment", () => {
    setUp()
    const action = noteUserAction('report', NOW.getTime())
    runBadgeEvaluation({ now: NOW, action })
    expect(runtime.unlocks).toHaveBeenCalledWith(
      ['reportSent.1'],
      NOW.getTime() + CELEBRATION_WINDOW_MS
    )

    expect(useBadgeSession.getState().celebrations).toEqual([])
    expect(runtime.capture).toHaveBeenCalledWith('badge_earned', {
      badge: 'reportSent',
      level: 1,
      kind: 'collection',
      after_action: true,
    })
  })

  it.each([
    ['iCloud Sync or the Watch', null],
    ['a Plan arriving overnight', null],
    ['a buddy confirming', null],
  ])('files a badge from %s quietly in the tray', (_source, action) => {
    const prefs = setUp()
    runBadgeEvaluation({ now: NOW, action })
    expect(runtime.unlocks).not.toHaveBeenCalled()
    expect(useBadgeSession.getState().celebrations).toEqual([])
    expect(prefs.earnedBadges['reportSent.1']).toBeDefined()
    expect(prefs.earnedBadges['reportSent.1'].history).toBeUndefined()
    expect(card(prefs)).toEqual(['reportSent.1'])
    expect(runtime.capture).toHaveBeenCalledWith(
      'badge_earned',
      expect.objectContaining({ after_action: false })
    )

    expect(runtime.announce).toHaveBeenCalledWith(['reportSent.1'])
  })

  it('finds no action behind a change long after the User acted', () => {
    const acted = NOW.getTime() - 60_000
    noteUserAction('time', acted)

    expect(actionBehind(NOW.getTime() - 1000, NOW.getTime())).toBeNull()

    expect(actionBehind(acted + 100, acted + 1600)?.kind).toBe('time')

    expect(actionBehind(acted + 5000, acted + 6600)).toBeNull()
  })

  it('celebrates nothing with Show badges off', () => {
    const prefs = setUp({ showBadges: false })
    runBadgeEvaluation({
      now: NOW,
      action: noteUserAction('report', NOW.getTime()),
    })
    expect(runtime.unlocks).not.toHaveBeenCalled()
    expect(prefs.earnedBadges['reportSent.1']).toBeDefined()
  })

  it('never celebrates while seeding', () => {
    const prefs = setUp()
    runBadgeEvaluation({
      now: NOW,
      quiet: true,
      action: noteUserAction('report', NOW.getTime()),
    })
    expect(runtime.unlocks).not.toHaveBeenCalled()
    expect(prefs.earnedBadges['reportSent.1'].history).toBe(true)
    expect(card(prefs)).toEqual([])
  })
})

describe('runBadgeEvaluation: right after onboarding', () => {
  it('welcomes a device whose first pass finds history', () => {
    const prefs = setUp({ firstPass: true })
    runBadgeEvaluation({ now: NOW })
    expect(prefs.badgesWelcome).toBe('pending')
  })

  it('files what onboarding brought in with no welcome or summary', () => {
    const prefs = setUp({ firstPass: true })
    runBadgeEvaluation({ now: NOW, afterOnboarding: true })
    expect(prefs.earnedBadges['reportSent.1'].history).toBe(true)
    expect(prefs.badgesWelcome).toBe('done')
    expect(useBadgeSession.getState().historyCount).toBe(0)
    expect(card(prefs)).toEqual([])

    expect(runtime.capture).toHaveBeenCalledWith('badges_history_found', {
      count: 1,
    })
  })

  it('takes over nothing on a device past its first pass', () => {
    const prefs = setUp()
    runBadgeEvaluation({
      now: NOW,
      afterOnboarding: true,
      action: noteUserAction('report', NOW.getTime()),
    })
    expect(runtime.unlocks).not.toHaveBeenCalled()
    expect(useBadgeSession.getState().historyCount).toBe(0)
    expect(prefs.earnedBadges['reportSent.1'].history).toBe(true)
    expect(card(prefs)).toEqual([])
    expect(runtime.announce).not.toHaveBeenCalled()
  })
})

describe('homeCardBadges', () => {
  const at = NOW.getTime()
  it('names new, recent, undismissed badges, most notable first', () => {
    expect(
      homeCardBadges({
        earned: {
          'monthsShared.1': { at: at - 5000 },
          'reportSent.2': { at: at - 5000 },
          'yearRound.1': { at: at - 1000 },

          'prepared.1': { at, history: true },
          'conversations.1': { at: 10 },
          'returnVisits.1': { at: at - 40 * 86_400_000 },
          'nextTime.1': { at },
        },
        seenAt: 100,
        dismissed: ['nextTime.1'],
        waiting: [],
        now: at,
      })
    ).toEqual(['yearRound.1', 'reportSent.2', 'monthsShared.1'])
  })
})
