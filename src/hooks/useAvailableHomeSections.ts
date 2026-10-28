import { useShallow } from 'zustand/react/shallow'
import useDevice from '@/hooks/useDevice'
import usePublisher from '@/hooks/usePublisher'
import { isHomeSectionAvailable, isHomeSectionShown } from '@/lib/homeSections'
import usePet from '@/stores/pet'
import {
  getEffectiveHomeScreenOrder,
  usePreferences,
} from '@/stores/preferences'

/**
 * Home's sections this User and device can show, in Home's order, and which of
 * them the User hid (to offer in Add Sections). Features' own availability
 * comes from the screen, which can read them.
 */
export default function useAvailableHomeSections({
  buddiesAvailable,
}: {
  buddiesAvailable: boolean
}) {
  const { isTablet } = useDevice()
  const { hasAnnualGoal, showsTimer } = usePublisher()
  const {
    homeScreenElements,
    homeScreenElementsOrder,
    mileageTrackingEnabled,
    petPromptDismissed,
  } = usePreferences(
    useShallow((s) => ({
      homeScreenElements: s.homeScreenElements,
      homeScreenElementsOrder: s.homeScreenElementsOrder,
      mileageTrackingEnabled: s.mileageTrackingEnabled,
      petPromptDismissed: s.petPromptDismissed,
    }))
  )
  const hasPet = usePet((s) => s.pet !== null)
  const available = getEffectiveHomeScreenOrder(homeScreenElementsOrder).filter(
    (key) =>
      isHomeSectionAvailable(key, {
        isTablet,
        hasAnnualGoal,
        showsTimer,
        mileageTrackingEnabled,
        buddiesAvailable,
      })
  )
  return {
    available,
    hidden: available.filter(
      (key) =>
        !isHomeSectionShown(key, {
          homeScreenElements,
          petPromptDismissed,
          hasPet,
        })
    ),
  }
}
