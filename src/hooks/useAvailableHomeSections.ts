import { useShallow } from 'zustand/react/shallow'
import useDevice from '@/hooks/useDevice'
import usePublisher from '@/hooks/usePublisher'
import { isHomeSectionAvailable } from '@/lib/homeSections'
import {
  getEffectiveHomeScreenOrder,
  usePreferences,
} from '@/stores/preferences'

/**
 * Home's sections this User and device can show, in Home's order, and which of
 * them the User hid (to offer in Add Sections).
 */
export default function useAvailableHomeSections() {
  const { isTablet } = useDevice()
  const { hasAnnualGoal, showsTimer } = usePublisher()
  const {
    homeScreenElements,
    homeScreenElementsOrder,
    mileageTrackingEnabled,
  } = usePreferences(
    useShallow((s) => ({
      homeScreenElements: s.homeScreenElements,
      homeScreenElementsOrder: s.homeScreenElementsOrder,
      mileageTrackingEnabled: s.mileageTrackingEnabled,
    }))
  )
  const available = getEffectiveHomeScreenOrder(homeScreenElementsOrder).filter(
    (key) =>
      isHomeSectionAvailable(key, {
        isTablet,
        hasAnnualGoal,
        showsTimer,
        mileageTrackingEnabled,
      })
  )
  return {
    available,
    hidden: available.filter(
      (key) => (homeScreenElements as Record<string, boolean>)[key] === false
    ),
  }
}
