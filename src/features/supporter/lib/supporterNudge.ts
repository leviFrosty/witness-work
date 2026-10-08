import moment from 'moment'
import { TimeEntriesByYear } from '@/types/timeEntry'
import { isCountableEntry } from '@/lib/serviceReport'

/**
 * Tenure, engagement, and cooldown thresholds for the tray supporter-nudge
 * card. Exported so dev tools and tests can reference the same numbers. See
 * `docs/supporter-nudge-plan.md` for rationale.
 */
export const SUPPORTER_NUDGE_THRESHOLDS = {
  tenureDays: 180,
  /**
   * Install age at which a heavy user — one who meets at least
   * `earlyEngagementFloors` of the engagement floors — can already be asked.
   * Power users find value in weeks and shouldn't wait half a year.
   */
  earlyTenureDays: 30,
  earlyEngagementFloors: 2,
  reportMonths: 6,
  totalHours: 50,
  contacts: 20,
  conversations: 10,
  cooldownDays: 365,
  /**
   * Quiet period after the build that introduced the nudge first runs. Without
   * this, existing long-tenure users who update would see the card immediately
   * on first launch — at the same moment `WhatsNewSheet` and other update
   * surfaces are competing for attention.
   */
  introGraceDays: 45,
} as const

export type SupporterNudgeEligibilityInput = {
  isSupporter: boolean
  hideDonateHeart: boolean
  hideSupporterNudge: boolean
  installedOn: Date
  supporterNudgeDismissedAt: number | null
  /**
   * Epoch ms when the user first launched a build that has the nudge feature.
   * `null` means the stamp hasn't run yet — predicate returns false until the
   * caller stamps it. See `useSupporterNotifications` for the stamping site.
   */
  supporterNudgeAvailableSince: number | null
  serviceReports: TimeEntriesByYear
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

const sumTotalHours = (reports: TimeEntriesByYear): number => {
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

/** How many of the three engagement floors are met (0–3). */
const engagementFloorsMet = (
  reports: TimeEntriesByYear,
  contactsCount: number,
  conversationsCount: number
): number =>
  [
    countReportMonths(reports) >= SUPPORTER_NUDGE_THRESHOLDS.reportMonths,
    sumTotalHours(reports) >= SUPPORTER_NUDGE_THRESHOLDS.totalHours,
    contactsCount >= SUPPORTER_NUDGE_THRESHOLDS.contacts &&
      conversationsCount >= SUPPORTER_NUDGE_THRESHOLDS.conversations,
  ].filter(Boolean).length

/**
 * Which tenure/engagement path qualified the user: `standard` (long tenure, any
 * engagement floor) or `early` (short tenure, heavy engagement).
 */
export type SupporterNudgePath = 'standard' | 'early'

/**
 * Pure predicate: should the supporter nudge be in the notifications tray now,
 * and through which path? `null` means no.
 *
 * Gates, all of which must pass:
 *
 * 1. User is not currently a supporter.
 * 2. User hasn't pre-expressed disinterest via `hideDonateHeart` or the dedicated
 *    `hideSupporterNudge` toggle.
 * 3. Either no prior dismissal, or ≥ `cooldownDays` since the last dismissal.
 * 4. The feature-intro grace period (`introGraceDays`) has elapsed since the first
 *    launch of a build that has the nudge — protects existing long-tenure users
 *    from seeing the card the moment they update. Someone who installed a build
 *    that already had the nudge never updated into it, so the tenure gate alone
 *    covers them.
 * 5. One tenure/engagement path:
 *
 *    - `standard`: install age ≥ `tenureDays` and at least one engagement floor
 *         (report-months, hours, or contacts + conversations).
 *    - `early`: install age ≥ `earlyTenureDays` and at least `earlyEngagementFloors`
 *         floors.
 *
 * The dev force-show flag (only under `__DEV__`) bypasses gates 3–5 but still
 * respects gate 1 — a supporter never sees the nudge.
 */
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

  // Stamp hasn't run yet on this device — wait for the tray hook to set it on
  // next render rather than firing the card mid-stamp.
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
