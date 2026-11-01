import moment from 'moment'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { StreakKind } from '@/lib/serviceStreak'
import type { RewardLine } from '@/stores/rewardStack'
import {
  COINS_PER_DAY,
  COINS_PER_MILESTONE,
  COINS_PER_PLAN_KEPT,
  type Earned,
} from '@/features/pet/lib/currency'

export type RewardSource = 'time' | 'visit' | 'checkbox' | 'elsewhere'

export type EarnedCounts = {
  daysOut: number
  plansKept: number
  shared: number

  milestones: number
}

export const earnedCounts = (earned: Earned): EarnedCounts => ({
  daysOut: earned.daysOut,
  plansKept: earned.plansKept,
  shared: earned.shared,
  milestones: earned.milestones.length,
})

export function rewardLines(
  before: EarnedCounts,
  after: Earned,
  source: RewardSource,
  streakKind: StreakKind
): RewardLine[] {
  const lines: RewardLine[] = []
  const dayGain =
    (after.daysOut - before.daysOut) * COINS_PER_DAY +
    (after.shared - before.shared)
  if (dayGain > 0)
    lines.push({
      amount: dayGain,
      label:
        after.shared > before.shared || source === 'checkbox'
          ? i18n.t('pet.reward.monthShared')
          : source === 'time'
            ? i18n.t('pet.reward.timeAdded')
            : source === 'visit'
              ? i18n.t('pet.reward.visitAdded')
              : i18n.t('pet.reward.daysOut' as TranslationKey, {
                  count: after.daysOut - before.daysOut,
                }),
      tone: after.shared > before.shared ? 'bonus' : 'base',
    })
  const kept = after.plansKept - before.plansKept
  if (kept > 0)
    lines.push({
      amount: kept * COINS_PER_PLAN_KEPT,
      label: i18n.t('pet.reward.plansKept' as TranslationKey, { count: kept }),
      tone: 'bonus',
    })
  for (const { count, on } of after.milestones.slice(before.milestones))
    lines.push({
      amount: COINS_PER_MILESTONE,
      label:
        streakKind === 'months'
          ? i18n.t('pet.reward.milestoneMonths' as TranslationKey, { count })
          : i18n.t('pet.reward.milestone', { count }),
      tone: 'milestone',
      celebration:
        source !== 'elsewhere' && celebratesNow(streakKind, on, new Date()),
    })
  return lines
}

function celebratesNow(kind: StreakKind, on: string, now: Date): boolean {
  const unit = kind === 'plans' ? 'day' : 'month'
  return on >= moment(now).subtract(1, unit).startOf(unit).format('YYYY-MM-DD')
}
