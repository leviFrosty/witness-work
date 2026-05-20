import { describe, it, expect } from 'vitest'
import moment from 'moment'
import {
  SUPPORTER_NUDGE_THRESHOLDS,
  isSupporterNudgeEligible,
  type SupporterNudgeEligibilityInput,
} from '@/features/supporter/lib/supporterNudge'
import { ServiceReportsByYears } from '@/types/serviceReport'

// Long-tenure, fully-engaged baseline: every gate other than the one under
// test passes. Individual cases override only what they need.
const now = new Date('2026-05-20T12:00:00Z')
const installedYearsAgo = moment(now).subtract(2, 'years').toDate()
const wellPastIntroGrace = moment(now)
  .subtract(SUPPORTER_NUDGE_THRESHOLDS.introGraceDays + 1, 'days')
  .valueOf()

const reportsWithSixMonths: ServiceReportsByYears = {
  2025: {
    0: [{ id: 'a', hours: 10, minutes: 0, date: new Date() } as never],
    1: [{ id: 'b', hours: 10, minutes: 0, date: new Date() } as never],
    2: [{ id: 'c', hours: 10, minutes: 0, date: new Date() } as never],
    3: [{ id: 'd', hours: 10, minutes: 0, date: new Date() } as never],
    4: [{ id: 'e', hours: 10, minutes: 0, date: new Date() } as never],
    5: [{ id: 'f', hours: 10, minutes: 0, date: new Date() } as never],
  },
}

const eligibleBaseline: SupporterNudgeEligibilityInput = {
  isSupporter: false,
  hideDonateHeart: false,
  hideSupporterNudge: false,
  installedOn: installedYearsAgo,
  supporterNudgeDismissedAt: null,
  supporterNudgeAvailableSince: wellPastIntroGrace,
  serviceReports: reportsWithSixMonths,
  contactsCount: 0,
  conversationsCount: 0,
  devForceShow: false,
  isDev: false,
  now,
}

describe('isSupporterNudgeEligible — intro grace gate', () => {
  it('passes the happy path when every gate (including intro grace) is met', () => {
    expect(isSupporterNudgeEligible(eligibleBaseline)).toBe(true)
  })

  it('blocks while `supporterNudgeAvailableSince` is null — stamp must run first', () => {
    // Simulates the very first launch of the build that has the nudge: the
    // HomeScreen useEffect will set the stamp this render, but the predicate
    // should not fire until at least the next render *and* the grace period.
    expect(
      isSupporterNudgeEligible({
        ...eligibleBaseline,
        supporterNudgeAvailableSince: null,
      })
    ).toBe(false)
  })

  it('blocks while still inside the intro grace window', () => {
    // Existing engaged user who just updated: stamp set today, but the
    // 45-day quiet period hasn't elapsed.
    const stampedToday = now.getTime()
    expect(
      isSupporterNudgeEligible({
        ...eligibleBaseline,
        supporterNudgeAvailableSince: stampedToday,
      })
    ).toBe(false)
  })

  it('blocks exactly at the grace boundary minus one day', () => {
    const justBefore = moment(now)
      .subtract(SUPPORTER_NUDGE_THRESHOLDS.introGraceDays - 1, 'days')
      .valueOf()
    expect(
      isSupporterNudgeEligible({
        ...eligibleBaseline,
        supporterNudgeAvailableSince: justBefore,
      })
    ).toBe(false)
  })

  it('passes once the grace period has fully elapsed', () => {
    const exactlyAtBoundary = moment(now)
      .subtract(SUPPORTER_NUDGE_THRESHOLDS.introGraceDays, 'days')
      .valueOf()
    expect(
      isSupporterNudgeEligible({
        ...eligibleBaseline,
        supporterNudgeAvailableSince: exactlyAtBoundary,
      })
    ).toBe(true)
  })

  it('dev force-show bypasses the intro grace gate', () => {
    expect(
      isSupporterNudgeEligible({
        ...eligibleBaseline,
        supporterNudgeAvailableSince: null,
        devForceShow: true,
        isDev: true,
      })
    ).toBe(true)
  })

  it('dev force-show still respects supporter status', () => {
    expect(
      isSupporterNudgeEligible({
        ...eligibleBaseline,
        isSupporter: true,
        supporterNudgeAvailableSince: null,
        devForceShow: true,
        isDev: true,
      })
    ).toBe(false)
  })

  it('production ignores `devForceShow` even when `supporterNudgeAvailableSince` is null', () => {
    expect(
      isSupporterNudgeEligible({
        ...eligibleBaseline,
        supporterNudgeAvailableSince: null,
        devForceShow: true,
        isDev: false,
      })
    ).toBe(false)
  })
})
