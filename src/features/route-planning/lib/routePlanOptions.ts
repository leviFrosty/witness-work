import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatPlanLocation } from '@/lib/placeSearch'
import type { RecurringPlan } from '@/lib/recurrence'
import type { DayPlan } from '@/types/timeEntry'
import { coordinateText } from '@/features/route-planning/lib/coordinateText'
import type { PlanStart } from '@/features/route-planning/lib/routeBuilder'
import { plansOnDay } from '@/features/route-planning/lib/routeStops'

/** A Plan on the day the route can belong to. */
export type RoutePlanOption = PlanStart & { title: string; recurring: boolean }

/** The day's Plans a route can belong to and start from, by start time. */
export const routePlanOptions = ({
  day,
  dayPlans,
  recurringPlans,
}: {
  day: Date
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}): RoutePlanOption[] =>
  plansOnDay({ day, dayPlans, recurringPlans })
    .map(({ plan, recurring, time, anytime }) => {
      const meets = plan.location
      const place =
        typeof meets?.latitude === 'number' &&
        typeof meets.longitude === 'number'
          ? formatPlanLocation(meets)
          : undefined
      return {
        id: plan.id,
        stopKey: `plan:${plan.id}`,
        title:
          plan.title?.trim() ||
          place?.primary ||
          (anytime ? i18n.t('planAnytime') : formatStartTime(time)),
        time,
        anytime,
        recurring,
        ...(place &&
          meets && {
            place: {
              title: plan.title?.trim() || place.primary,
              subtitle: plan.title?.trim() ? place.primary : place.secondary,
              coordinate: {
                latitude: meets.latitude!,
                longitude: meets.longitude!,
              },
              destination:
                meets.address?.trim() ||
                coordinateText({
                  latitude: meets.latitude!,
                  longitude: meets.longitude!,
                }),
            },
          }),
      }
    })
    .sort((a, b) => a.time - b.time)
