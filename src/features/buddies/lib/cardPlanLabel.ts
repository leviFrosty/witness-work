import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import type { MinuteDisplayFormat } from '@/types/timeEntry'
import type {
  BuddyCardDay,
  BuddyTimeOfDay,
} from '@/features/buddies/lib/schemas'

const TIME_OF_DAY_LABEL = {
  m: 'buddies_timeOfDayMorning',
  a: 'buddies_timeOfDayAfternoon',
  e: 'buddies_timeOfDayEvening',
} as const satisfies Record<BuddyTimeOfDay, string>

export function cardPlanLabel(
  plan: BuddyCardDay['p'][number],
  timeDisplayFormat: MinuteDisplayFormat
): string {
  const duration = formatMinutes(plan.m, timeDisplayFormat).formatted
  if (plan.s !== undefined)
    return i18n.t('buddies_dayPlanAtTime', {
      time: formatStartTime(plan.s),
      duration,
    })
  if (plan.t)
    return i18n.t('buddies_dayPlanAtTime', {
      time: i18n.t(TIME_OF_DAY_LABEL[plan.t]),
      duration,
    })
  return i18n.t('buddies_dayPlanAnyTime', { duration })
}
