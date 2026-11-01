import {
  ALL_TIME_CARDS,
  defaultAllTimeProgressCards,
  type AllTimeCardId,
} from '@/lib/progressCards'
import { usePreferences } from '@/stores/preferences'
import { ALL_TIME_PROGRESS_CARDS } from '@/features/progress/components/cards/allTime/allTimeCardRegistry'
import useProgressCardLayout from '@/features/progress/hooks/useProgressCardLayout'

export default function useAllTimeProgressCards() {
  const mileageTrackingEnabled = usePreferences((s) => s.mileageTrackingEnabled)
  return useProgressCardLayout({
    catalog: ALL_TIME_CARDS,
    defaults: defaultAllTimeProgressCards(),
    isAvailable: (id: AllTimeCardId) =>
      id !== 'mileage' || mileageTrackingEnabled === true,
    title: (id) => ALL_TIME_PROGRESS_CARDS[id].title(),
  })
}
