import moment from 'moment'
import { Alert } from 'react-native'
import { analytics } from '@/lib/analytics'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { getStartTimeInMinutes } from '@/lib/normalizeDate'
import {
  getEffectiveStartTimeInMinutesForRecurringPlan,
  isRecurringPlanAnytimeOnDate,
} from '@/lib/recurrence'
import { useServiceReport } from '@/stores/serviceReport'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { overlappingOwnPlans } from '@/features/buddies/lib/joinRequests'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * "Going" adds the buddy's Plan to this User's; one of their own at the same
 * time, one-time or recurring, would then be counted twice, so offer to replace
 * it. A recurring Plan only loses that day's instance. Runs after every Going
 * answer, wherever it's given.
 */
export default function offerReplaceOverlappingPlans(
  shareKey: string,
  fallbackName?: string
): void {
  const { incomingShares, buddies } = useBuddies.getState()
  const share = incomingShares[shareKey]
  if (!share || share.type !== 'plan') return
  const { dayPlans, recurringPlans } = useServiceReport.getState()
  const overlapping = overlappingOwnPlans(
    share.details,
    dayPlans,
    recurringPlans
  )
  if (overlapping.length === 0) return
  const [first] = overlapping
  const day = moment(share.details.d, 'YYYY-MM-DD')
  const date = day.format('ddd, MMM D')
  const hasRecurring = overlapping.some(
    (contribution) => contribution.source === 'recurring'
  )
  const resolve = (choice: 'replace' | 'keep_both') => {
    analytics.capture('buddy_invite_overlap_resolved', {
      choice,
      includes_recurring: hasRecurring,
    })
    if (choice !== 'replace') return
    const { deleteDayPlan, deleteSingleEventFromRecurringPlan } =
      useServiceReport.getState()
    for (const contribution of overlapping) {
      if (contribution.source === 'day') deleteDayPlan(contribution.plan.id)
      else
        deleteSingleEventFromRecurringPlan(contribution.plan.id, day.toDate())
    }
  }
  const buddy = buddies.find((b) => b.inboxId === share.from)
  const name = buddy ? buddyDisplayName(buddy) : (fallbackName ?? '')
  const firstStart =
    first.source === 'day'
      ? getStartTimeInMinutes(first.plan)
      : getEffectiveStartTimeInMinutesForRecurringPlan(first.plan, day.toDate())
  // An anytime Plan has no time to name.
  const firstAnytime =
    first.source === 'day'
      ? !!first.plan.anytime
      : isRecurringPlanAnytimeOnDate(first.plan, day.toDate())
  Alert.alert(
    i18n.t('buddies_replacePlanTitle'),
    overlapping.length === 1
      ? firstAnytime
        ? i18n.t(
            hasRecurring
              ? 'buddies_replaceRecurringPlanBodyAnytime'
              : 'buddies_replacePlanBodyAnytime',
            { date, name }
          )
        : i18n.t(
            hasRecurring
              ? 'buddies_replaceRecurringPlanBody'
              : 'buddies_replacePlanBody',
            { time: formatStartTime(firstStart), date, name }
          )
      : i18n.t(
          hasRecurring
            ? 'buddies_replaceRecurringPlansBody'
            : 'buddies_replacePlansBody',
          { count: overlapping.length, date, name }
        ),
    [
      {
        text: i18n.t('buddies_keepBoth'),
        style: 'cancel',
        onPress: () => resolve('keep_both'),
      },
      {
        text: i18n.t('buddies_replacePlan'),
        style: 'destructive',
        onPress: () => resolve('replace'),
      },
    ]
  )
}
