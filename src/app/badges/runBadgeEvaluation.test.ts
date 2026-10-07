import moment from 'moment'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EarnedBadge } from '@/types/badges'

const runtime = vi.hoisted(() => ({
  prefs: {} as Record<string, unknown>,
  capture: vi.fn(),
  announce: vi.fn(async (_keys: string[]) => {}),
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

/** A device past its first pass whose User sent this month's report. */
function setUp({ showBadges = true } = {}) {
  const prefs = {
    earnedBadges: {} as Record<string, EarnedBadge>,
    badgeLedger: [] as string[],
    submittedReportMonths: [thisMonth],
    badgesBackfilledAt: NOW.getTime() - 86_400_000,
    badgesWelcome: 'done',
    badgesSeenAt: 0,
    badgeCardDismissed: [] as string[],
    showBadges,
    recordBadges: ({
      earned,
      ledger,
    }: {
      earned: { key: string; record: EarnedBadge }[]
      ledger: string[]
    }) => {
      for (const { key, record } of earned) prefs.earnedBadges[key] ??= record
      prefs.badgeLedger = [...prefs.badgeLedger, ...ledger]
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
  it('celebrates a badge the User just earned, tied to that action', () => {
    const prefs = setUp()
    const action = noteUserAction('report', NOW.getTime())
    runBadgeEvaluation({ now: NOW, action })
    const session = useBadgeSession.getState()
    expect(session.celebrations).toEqual(['reportSent.1'])
    expect(session.claim).toEqual({
      group: `action:${action.id}`,
      expiresAt: NOW.getTime() + CELEBRATION_WINDOW_MS,
    })
    // Waiting for its celebration, so the Home card doesn't name it too.
    expect(card(prefs)).toEqual([])
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
  ])('files a badge from %s quietly on the Home card', (_source, action) => {
    const prefs = setUp()
    runBadgeEvaluation({ now: NOW, action })
    expect(useBadgeSession.getState().celebrations).toEqual([])
    expect(prefs.earnedBadges['reportSent.1']).toBeDefined()
    expect(prefs.earnedBadges['reportSent.1'].history).toBeUndefined()
    expect(card(prefs)).toEqual(['reportSent.1'])
    expect(runtime.capture).toHaveBeenCalledWith(
      'badge_earned',
      expect.objectContaining({ after_action: false })
    )
    // Buddies still hear about it: only the User's own screen stays quiet.
    expect(runtime.announce).toHaveBeenCalledWith(['reportSent.1'])
  })

  it('finds no action behind a change long after the User acted', () => {
    const acted = NOW.getTime() - 60_000
    noteUserAction('time', acted)
    // A sync lands a minute later: not caused by the action.
    expect(actionBehind(NOW.getTime() - 1000, NOW.getTime())).toBeNull()
    // The same action, still within its moment, behind its own change.
    expect(actionBehind(acted + 100, acted + 1600)?.kind).toBe('time')
    // A change that starts seconds after an unrelated save isn't the save's.
    expect(actionBehind(acted + 5000, acted + 6600)).toBeNull()
  })

  it('celebrates nothing with Show badges off', () => {
    const prefs = setUp({ showBadges: false })
    runBadgeEvaluation({
      now: NOW,
      action: noteUserAction('report', NOW.getTime()),
    })
    expect(useBadgeSession.getState().celebrations).toEqual([])
    expect(prefs.earnedBadges['reportSent.1']).toBeDefined()
  })

  it('never celebrates while seeding', () => {
    const prefs = setUp()
    runBadgeEvaluation({
      now: NOW,
      quiet: true,
      action: noteUserAction('report', NOW.getTime()),
    })
    expect(useBadgeSession.getState().celebrations).toEqual([])
    expect(prefs.earnedBadges['reportSent.1'].history).toBe(true)
    expect(card(prefs)).toEqual([])
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
          // Found in history, already seen, too old, or dismissed: not named.
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
