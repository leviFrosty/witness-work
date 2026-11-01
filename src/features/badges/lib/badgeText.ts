import moment from 'moment'
import { collectionSpec } from '@/lib/badges/catalog'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import type { BadgeCollectionId, BadgeLevel, EarnedBadge } from '@/types/badges'
import { formatDisplay } from '@/lib/dates'

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

export const nextLevel = (level: BadgeLevel | 0): BadgeLevel | null =>
  level >= 4 ? null : ((level + 1) as BadgeLevel)

export const progressToward = (
  art: BadgeCollectionId,
  count: number,
  level: BadgeLevel
) => {
  const total = collectionSpec(art).thresholds[level - 1]
  const done = Math.max(0, Math.min(count, total))
  return { done, total, fraction: total > 0 ? done / total : 0 }
}

export const progressLabel = (
  art: BadgeCollectionId,
  done: number,
  total: number
) =>
  i18n.t(progressUnitKey(art) as TranslationKey, {
    count: total,
    done: formatNumber(done),
  })

const monthYear = (record: EarnedBadge) =>
  formatDisplay(
    record.month ? moment(record.month, 'YYYY-MM') : moment(record.at),
    'MMMM YYYY'
  )

export const earnedLabel = (record: EarnedBadge) =>
  record.history && !record.month
    ? i18n.t('badges_foundInHistory')
    : i18n.t('badges_earnedOn', { date: monthYear(record) })
