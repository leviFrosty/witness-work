import { describe, it, expect } from 'vitest'
import moment from 'moment'
import {
  SUPPORTER_NUDGE_THRESHOLDS,
  isSupporterNudgeEligible,
  supporterNudgePath,
  type SupporterNudgeEligibilityInput,
} from '@/features/supporter/lib/supporterNudge'
import { TimeEntriesByYear } from '@/types/timeEntry'

const now = new Date('2026-05-20T12:00:00Z')
const installedYearsAgo = moment(now).subtract(2, 'years').toDate()
const wellPastIntroGrace = moment(now)
  .subtract(SUPPORTER_NUDGE_THRESHOLDS.introGraceDays + 1, 'days')
  .valueOf()

const reportsWithSixMonths: TimeEntriesByYear = {
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
    expect(
      isSupporterNudgeEligible({
        ...eligibleBaseline,
        supporterNudgeAvailableSince: null,
      })
    ).toBe(false)
  })

  it('blocks while still inside the intro grace window', () => {
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

describe('supporterNudgePath — tenure and engagement', () => {
  const installedDaysAgo = (days: number) =>
    moment(now).subtract(days, 'days').toDate()

  const newInstall = (days: number) => ({
    installedOn: installedDaysAgo(days),
    supporterNudgeAvailableSince: installedDaysAgo(days).getTime(),
  })
  const oneMonthOfHours: TimeEntriesByYear = {
    2026: {
      4: [{ id: 'a', hours: 55, minutes: 0, date: new Date() } as never],
    },
  }

  it('asks long-tenure users who meet one engagement floor', () => {
    expect(
      supporterNudgePath({
        ...eligibleBaseline,
        serviceReports: oneMonthOfHours,
      })
    ).toBe('standard')
  })

  it('asks heavy users early once two engagement floors are met', () => {
    expect(
      supporterNudgePath({
        ...eligibleBaseline,
        ...newInstall(SUPPORTER_NUDGE_THRESHOLDS.earlyTenureDays),
        serviceReports: oneMonthOfHours,
        contactsCount: SUPPORTER_NUDGE_THRESHOLDS.contacts,
        conversationsCount: SUPPORTER_NUDGE_THRESHOLDS.conversations,
      })
    ).toBe('early')
  })

  it('waits for full tenure when only one floor is met', () => {
    expect(
      supporterNudgePath({
        ...eligibleBaseline,
        ...newInstall(SUPPORTER_NUDGE_THRESHOLDS.earlyTenureDays),
        serviceReports: oneMonthOfHours,
      })
    ).toBeNull()
  })

  it('never asks before the early tenure', () => {
    expect(
      supporterNudgePath({
        ...eligibleBaseline,
        ...newInstall(SUPPORTER_NUDGE_THRESHOLDS.earlyTenureDays - 1),
        contactsCount: SUPPORTER_NUDGE_THRESHOLDS.contacts,
        conversationsCount: SUPPORTER_NUDGE_THRESHOLDS.conversations,
      })
    ).toBeNull()
  })

  it('skips the intro grace for installs that already had the nudge', () => {
    expect(
      supporterNudgePath({
        ...eligibleBaseline,
        ...newInstall(SUPPORTER_NUDGE_THRESHOLDS.introGraceDays - 10),
      })
    ).toBe('early')
  })

  it('still respects the dismissal cooldown on the early path', () => {
    expect(
      supporterNudgePath({
        ...eligibleBaseline,
        ...newInstall(SUPPORTER_NUDGE_THRESHOLDS.earlyTenureDays + 10),
        supporterNudgeDismissedAt: installedDaysAgo(1).getTime(),
      })
    ).toBeNull()
  })
})
