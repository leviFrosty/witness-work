import usePublisher from '@/hooks/usePublisher'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import {
  defaultProgressCards,
  MONTH_CARDS,
  type ProgressCardId,
} from '@/lib/progressCards'
import { usePreferences } from '@/stores/preferences'
import { useShallow } from 'zustand/react/shallow'
import { PROGRESS_CARDS } from '@/features/progress/components/cards/progressCardRegistry'
import useProgressCardLayout from '@/features/progress/hooks/useProgressCardLayout'

export function useProgressCardAvailability(month: number, year: number) {
  const { entryMode, hasAnnualGoal } = usePublisher({ month, year })
  const { effectiveGoalHours } = useMonthlyGoal({ month, year })
  const { showStreaks, mileageTrackingEnabled } = usePreferences(
    useShallow((s) => ({
      showStreaks: s.showStreaks,
      mileageTrackingEnabled: s.mileageTrackingEnabled,
    }))
  )
  return (id: ProgressCardId): boolean => {
    switch (id) {
      case 'dailyPace':
      case 'projected':
        return effectiveGoalHours > 0
      case 'credit':
        return entryMode === 'hours'
      case 'yearPace':
        return hasAnnualGoal
      case 'streak':
        return showStreaks
      case 'mileage':
        return mileageTrackingEnabled === true
      default:
        return true
    }
  }
}

export default function useProgressCards(month: number, year: number) {
  const { monthlyGoalHours } = usePublisher()
  return useProgressCardLayout({
    catalog: MONTH_CARDS,
    defaults: defaultProgressCards({ hasMonthlyGoal: monthlyGoalHours > 0 }),
    isAvailable: useProgressCardAvailability(month, year),
    title: (id) => PROGRESS_CARDS[id].title(),
  })
}
