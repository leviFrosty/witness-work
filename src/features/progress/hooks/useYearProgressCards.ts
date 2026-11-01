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

export default function useYearProgressCards(serviceYear: number) {
  const { hasAnnualGoal, showsTimeEntry } = usePublisher()
  return useProgressCardLayout({
    catalog: YEAR_CARDS,
    defaults: defaultYearProgressCards({ hasAnnualGoal, showsTimeEntry }),
    isAvailable: useYearCardAvailability(serviceYear),
    title: (id) => YEAR_PROGRESS_CARDS[id].title(),
  })
}
