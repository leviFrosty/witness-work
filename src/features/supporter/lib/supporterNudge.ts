import moment from 'moment'
import { TimeEntriesByYear } from '@/types/timeEntry'
import { isCountableEntry } from '@/lib/serviceReport'
import { entryMinutes } from '@/lib/entryMinutes'

export const SUPPORTER_NUDGE_THRESHOLDS = {
  tenureDays: 180,

  earlyTenureDays: 30,
  earlyEngagementFloors: 2,
  reportMonths: 6,
  totalHours: 50,
  contacts: 20,
  conversations: 10,
  cooldownDays: 365,

  introGraceDays: 45,
} as const

export type SupporterNudgeEligibilityInput = {
  isSupporter: boolean
  hideDonateHeart: boolean
  hideSupporterNudge: boolean
  installedOn: Date
  supporterNudgeDismissedAt: number | null

  supporterNudgeAvailableSince: number | null
  serviceReports: TimeEntriesByYear
  contactsCount: number
  conversationsCount: number

  devForceShow: boolean
  isDev: boolean

  now?: Date
}

const countReportMonths = (reports: TimeEntriesByYear): number => {
  let count = 0
  for (const year of Object.keys(reports)) {
    const yearReports = reports[year]
    if (!yearReports) continue
    for (const month of Object.keys(yearReports)) {
      const monthReports = yearReports[month]
      if (monthReports?.some(isCountableEntry)) {
        count += 1
      }
    }
  }
  return count
}

const sumTotalMinutes = (reports: TimeEntriesByYear): number => {
  let total = 0
  for (const year of Object.keys(reports)) {
    const yearReports = reports[year]
    if (!yearReports) continue
    for (const month of Object.keys(yearReports)) {
      const monthReports = yearReports[month]
      if (!monthReports) continue
      for (const r of monthReports) {
        total += entryMinutes(r)
      }
    }
  }
  return total
}

const engagementFloorsMet = (
  reports: TimeEntriesByYear,
  contactsCount: number,
  conversationsCount: number
): number =>
  [
    countReportMonths(reports) >= SUPPORTER_NUDGE_THRESHOLDS.reportMonths,
    sumTotalMinutes(reports) >= SUPPORTER_NUDGE_THRESHOLDS.totalHours * 60,
    contactsCount >= SUPPORTER_NUDGE_THRESHOLDS.contacts &&
      conversationsCount >= SUPPORTER_NUDGE_THRESHOLDS.conversations,
  ].filter(Boolean).length

export type SupporterNudgePath = 'standard' | 'early'

export const supporterNudgePath = (
  input: SupporterNudgeEligibilityInput
): SupporterNudgePath | null => {
  const {
    isSupporter,
    hideDonateHeart,
    hideSupporterNudge,
    installedOn,
    supporterNudgeDismissedAt,
    supporterNudgeAvailableSince,
    serviceReports,
    contactsCount,
    conversationsCount,
    devForceShow,
    isDev,
    now = new Date(),
  } = input

  if (isSupporter) return null
  if (hideDonateHeart) return null
  if (hideSupporterNudge) return null

  if (isDev && devForceShow) return 'standard'

  if (supporterNudgeDismissedAt !== null) {
    const cooldownOver = moment(supporterNudgeDismissedAt)
      .add(SUPPORTER_NUDGE_THRESHOLDS.cooldownDays, 'days')
      .isSameOrBefore(moment(now))
    if (!cooldownOver) return null
  }

  if (supporterNudgeAvailableSince === null) return null
  const updatedIntoNudge =
    moment(supporterNudgeAvailableSince).diff(moment(installedOn), 'days') >= 1
  if (updatedIntoNudge) {
    const introGraceOver = moment(supporterNudgeAvailableSince)
      .add(SUPPORTER_NUDGE_THRESHOLDS.introGraceDays, 'days')
      .isSameOrBefore(moment(now))
    if (!introGraceOver) return null
  }

  const tenureDays = moment(now).diff(moment(installedOn), 'days', true)
  const floors = engagementFloorsMet(
    serviceReports,
    contactsCount,
    conversationsCount
  )
  if (tenureDays >= SUPPORTER_NUDGE_THRESHOLDS.tenureDays && floors >= 1) {
    return 'standard'
  }
  if (
    tenureDays >= SUPPORTER_NUDGE_THRESHOLDS.earlyTenureDays &&
    floors >= SUPPORTER_NUDGE_THRESHOLDS.earlyEngagementFloors
  ) {
    return 'early'
  }
  return null
}

export const isSupporterNudgeEligible = (
  input: SupporterNudgeEligibilityInput
): boolean => supporterNudgePath(input) !== null
