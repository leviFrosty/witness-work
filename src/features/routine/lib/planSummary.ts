import i18n from '@/lib/locales'
import { planMinutesADay, planPortionCount } from '@/lib/routine/readingPlans'
import {
  choiceShape,
  type ReadingPlanChoice,
} from '@/features/routine/lib/readingPlanChoice'

export function planLengthLabel(days: number): string {
  if (days < 90) return i18n.t('routine.plan.days', { count: days })
  const months = Math.round(days / 30.44)
  if (months !== 12 && days < 730)
    return i18n.t('routine.plan.months', { count: months })
  return i18n.t('routine.plan.years', { count: Math.round(days / 365.25) })
}

export function planSummary(choice: ReadingPlanChoice): string {
  const shape = choiceShape(choice)
  return i18n.t('routine.plan.summary', {
    time: i18n.t('routine.plan.minutesADay', {
      count: planMinutesADay(shape),
    }),
    length: planLengthLabel(planPortionCount(shape)),
  })
}
