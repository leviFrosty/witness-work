import moment from 'moment'
import useServiceReport from '@/stores/serviceReport'
import useDayRouteStops from '@/features/route-planning/hooks/useDayRouteStops'
import {
  dayRouteStopsFor,
  startingPlan,
} from '@/features/route-planning/lib/routeBuilder'
import { routePlanOptions } from '@/features/route-planning/lib/routePlanOptions'
import { useSavedRoutes } from '@/features/route-planning/stores/savedRoutes'

/**
 * How many stops `day`'s route has, as its entry points say: the route built
 * for the day (`planned`), or the day's stops ready to plan, as the route
 * builder would open them. `stops` are those stops.
 */
export default function useDayRouteStopCount(day: Date) {
  const dayKey = moment(day).format('YYYY-MM-DD')
  const { stops: dayStops } = useDayRouteStops(day)
  const saved = useSavedRoutes((s) => s.routes[dayKey])
  const dayPlans = useServiceReport((s) => s.dayPlans)
  const recurringPlans = useServiceReport((s) => s.recurringPlans)
  const start = startingPlan(
    routePlanOptions({ day, dayPlans, recurringPlans }),
    dayStops
  )
  const { stops, planned } = dayRouteStopsFor(dayKey, dayStops, saved, start)
  return { count: stops.length, planned, stops }
}
