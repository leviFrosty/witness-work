import usePublisher from '@/hooks/usePublisher'
import {
  defaultYearProgressCards,
  YEAR_CARDS,
  type YearCardId,
} from '@/lib/progressCards'
import { serviceYearFocusMonth } from '@/lib/roleHistory'
import { usePreferences } from '@/stores/preferences'
import { YEAR_PROGRESS_CARDS } from '@/features/progress/components/cards/year/yearCardRegistry'
import useProgressCardLayout from '@/features/progress/hooks/useProgressCardLayout'

/**
 * Which Year cards make sense for the Service Year shown, by the role that
 * speaks for it: a pace and what's needed only against an Annual Goal, and hour
 * figures only for a User who logs hours.
 */
export function useYearCardAvailability(serviceYear: number) {
  const { hasAnnualGoal, showsTimeEntry } = usePublisher(
    serviceYearFocusMonth(serviceYear)
  )
  const mileageTrackingEnabled = usePreferences((s) => s.mileageTrackingEnabled)
  return (id: YearCardId): boolean => {
    switch (id) {
      case 'pace':
      case 'needed':
        return hasAnnualGoal
      case 'monthlyAverage':
      case 'bestMonth':
      case 'lastYear':
      case 'serviceDays':
        return showsTimeEntry
      case 'mileage':
        return mileageTrackingEnabled === true
      default:
        return true
    }
  }
}

/** The User's cards on Progress → Year (`serviceYear` is the start year). */
export default function useYearProgressCards(serviceYear: number) {
  // Defaults follow today's role so they don't change from year to year.
  const { hasAnnualGoal, showsTimeEntry } = usePublisher()
  return useProgressCardLayout({
    catalog: YEAR_CARDS,
    defaults: defaultYearProgressCards({ hasAnnualGoal, showsTimeEntry }),
    isAvailable: useYearCardAvailability(serviceYear),
    title: (id) => YEAR_PROGRESS_CARDS[id].title(),
  })
}
