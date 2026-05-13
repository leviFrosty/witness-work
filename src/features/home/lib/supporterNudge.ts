import moment from 'moment'
import { ServiceReportsByYears } from '@/types/serviceReport'

/**
 * Tenure, engagement, and cooldown thresholds for the Home supporter-nudge
 * card. Exported so dev tools and tests can reference the same numbers. See
 * `docs/supporter-nudge-plan.md` for rationale.
 */
export const SUPPORTER_NUDGE_THRESHOLDS = {
  tenureDays: 180,
  reportMonths: 6,
  totalHours: 50,
  contacts: 20,
  conversations: 10,
  cooldownDays: 365,
} as const

export type SupporterNudgeEligibilityInput = {
  isSupporter: boolean
  hideDonateHeart: boolean
  hideSupporterNudge: boolean
  installedOn: Date
  supporterNudgeDismissedAt: number | null
  serviceReports: ServiceReportsByYears
  contactsCount: number
  conversationsCount: number
  /** Only honored when `__DEV__` is true. Callers pass `__DEV__` for `isDev`. */
  devForceShow: boolean
  isDev: boolean
  /** Defaults to `new Date()` — injectable for tests. */
  now?: Date
}

/**
 * Count of distinct (year, month) buckets that contain at least one service
 * report. "6 months of reports" across any calendar window, not 6 consecutive.
 */
const countReportMonths = (reports: ServiceReportsByYears): number => {
  let count = 0
  for (const year of Object.keys(reports)) {
    const yearReports = reports[year]
    if (!yearReports) continue
    for (const month of Object.keys(yearReports)) {
      const monthReports = yearReports[month]
      if (monthReports && monthReports.length > 0) {
        count += 1
      }
    }
  }
  return count
}

const sumTotalHours = (reports: ServiceReportsByYears): number => {
  let total = 0
  for (const year of Object.keys(reports)) {
    const yearReports = reports[year]
    if (!yearReports) continue
    for (const month of Object.keys(yearReports)) {
      const monthReports = yearReports[month]
      if (!monthReports) continue
      for (const r of monthReports) {
        total += (r.hours ?? 0) + (r.minutes ?? 0) / 60
      }
    }
  }
  return total
}

const meetsEngagementFloor = (
  reports: ServiceReportsByYears,
  contactsCount: number,
  conversationsCount: number
): boolean => {
  if (countReportMonths(reports) >= SUPPORTER_NUDGE_THRESHOLDS.reportMonths) {
    return true
  }
  if (sumTotalHours(reports) >= SUPPORTER_NUDGE_THRESHOLDS.totalHours) {
    return true
  }
  if (
    contactsCount >= SUPPORTER_NUDGE_THRESHOLDS.contacts &&
    conversationsCount >= SUPPORTER_NUDGE_THRESHOLDS.conversations
  ) {
    return true
  }
  return false
}

/**
 * Pure predicate: should the Home supporter-nudge card render right now?
 *
 * Gates, all of which must pass:
 *
 * 1. User is not currently a supporter.
 * 2. User hasn't pre-expressed disinterest via `hideDonateHeart` or the dedicated
 *    `hideSupporterNudge` toggle.
 * 3. Install age ≥ `tenureDays`.
 * 4. At least one engagement floor is met (report-months, hours, or contacts +
 *    conversations).
 * 5. Either no prior dismissal, or ≥ `cooldownDays` since the last dismissal.
 *
 * The dev force-show flag (only under `__DEV__`) bypasses gates 3, 4, and 5 but
 * still respects gate 1 — a supporter never sees the nudge.
 */
export const isSupporterNudgeEligible = (
  input: SupporterNudgeEligibilityInput
): boolean => {
  const {
    isSupporter,
    hideDonateHeart,
    hideSupporterNudge,
    installedOn,
    supporterNudgeDismissedAt,
    serviceReports,
    contactsCount,
    conversationsCount,
    devForceShow,
    isDev,
    now = new Date(),
  } = input

  if (isSupporter) return false
  if (hideDonateHeart) return false
  if (hideSupporterNudge) return false

  if (isDev && devForceShow) return true

  const tenureMet = moment(installedOn)
    .add(SUPPORTER_NUDGE_THRESHOLDS.tenureDays, 'days')
    .isSameOrBefore(moment(now))
  if (!tenureMet) return false

  if (
    !meetsEngagementFloor(serviceReports, contactsCount, conversationsCount)
  ) {
    return false
  }

  if (supporterNudgeDismissedAt !== null) {
    const cooldownOver = moment(supporterNudgeDismissedAt)
      .add(SUPPORTER_NUDGE_THRESHOLDS.cooldownDays, 'days')
      .isSameOrBefore(moment(now))
    if (!cooldownOver) return false
  }

  return true
}
