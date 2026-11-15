import i18n from '@/lib/locales'
import { planMinutesADay, planPortionCount } from '@/lib/routine/readingPlans'
import {
  choiceShape,
  type CustomPlanChoice,
} from '@/features/routine/lib/readingPlanChoice'

export function planLengthLabel(days: number): string {
  if (days < 90) return i18n.t('routine.plan.days', { count: days })
  if (days < 730)
    return i18n.t('routine.plan.months', { count: Math.round(days / 30.44) })
  return i18n.t('routine.plan.years', { count: Math.round(days / 365.25) })
}

export function planSummary(choice: CustomPlanChoice): string {
  const shape = choiceShape(choice)
  return i18n.t('routine.plan.summary', {
    time: i18n.t('routine.plan.minutesADay', {
      count: planMinutesADay(shape),
    }),
    length: planLengthLabel(planPortionCount(shape)),
  })
}
