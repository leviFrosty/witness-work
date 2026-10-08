import moment from 'moment'
import { collectionSpec } from '@/lib/badges/catalog'
import i18n, { TranslationKey } from '@/lib/locales'
import type { BadgeCollectionId, BadgeLevel, EarnedBadge } from '@/types/badges'

/**
 * What a collection counts, as a plural "{{done}} of {{count}} …" string:
 * Service Years for Year Round, months with one person for Keeping in Touch,
 * reports for Reports Sent, plain months for the rest.
 */
export const progressUnitKey = (art: BadgeCollectionId) => {
  switch (art) {
    case 'yearRound':
      return 'badges_progressServiceYears'
    case 'keepingInTouch':
      return 'badges_progressPersonMonths'
    case 'reportSent':
      return 'badges_progressReports'
    default:
      return 'badges_progressMonths'
  }
}

/** The first level not reached yet, or null once Pearl is reached. */
export const nextLevel = (level: BadgeLevel | 0): BadgeLevel | null =>
  level >= 4 ? null : ((level + 1) as BadgeLevel)

/**
 * Progress toward one level of a collection. `done` never passes the level's
 * threshold, so a bar never overflows.
 */
export const progressToward = (
  art: BadgeCollectionId,
  count: number,
  level: BadgeLevel
) => {
  const total = collectionSpec(art).thresholds[level - 1]
  const done = Math.max(0, Math.min(count, total))
  return { done, total, fraction: total > 0 ? done / total : 0 }
}

/** "4 of 6 months" in the collection's own unit. */
export const progressLabel = (
  art: BadgeCollectionId,
  done: number,
  total: number
) =>
  i18n.t(progressUnitKey(art) as TranslationKey, {
    count: total,
    done: done.toLocaleString(),
  })

/** `YYYY-MM` (or epoch ms) as "March 2026" in the app's locale. */
const monthYear = (record: EarnedBadge) =>
  (record.month ? moment(record.month, 'YYYY-MM') : moment(record.at)).format(
    'MMMM YYYY'
  )

/**
 * When a badge was earned: the month whose activity reached it, else the day it
 * was recorded. A badge found in history without a known month says so.
 */
export const earnedLabel = (record: EarnedBadge) =>
  record.history && !record.month
    ? i18n.t('badges_foundInHistory')
    : i18n.t('badges_earnedOn', { date: monthYear(record) })
