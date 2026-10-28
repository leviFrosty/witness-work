import useDevice from '@/hooks/useDevice'
import useEditMode from '@/hooks/useEditMode'
import usePublisher from '@/hooks/usePublisher'
import { analytics } from '@/lib/analytics'
import { isHomeSectionAvailable, isHomeSectionOn } from '@/lib/homeSections'
import {
  getEffectiveHomeScreenOrder,
  type HomeScreenElementKey,
  usePreferences,
} from '@/stores/preferences'

export type HomeEditSource = 'menu' | 'background' | 'footer'

type Layout = { order: HomeScreenElementKey[]; hidden: HomeScreenElementKey[] }

const currentLayout = (): Layout => {
  const { homeScreenElementsOrder, homeScreenElements } =
    usePreferences.getState()
  const order = getEffectiveHomeScreenOrder(homeScreenElementsOrder)
  return {
    order,
    hidden: order.filter((key) => !isHomeSectionOn(key, homeScreenElements)),
  }
}

/**
 * Edit mode for Home's sections, like the Home Screen's jiggle mode: from a
 * section's Edit Home Screen, the Edit Home Screen button after the sections,
 * or holding empty space. Changes save as they're made; finishing reports what
 * changed once (`home_screen_customized`). Pass `lifecycle` from the screen
 * only (see `useEditMode`), and `buddiesAvailable` wherever editing can
 * finish.
 */
export default function useHomeEditing({
  lifecycle = false,
  buddiesAvailable = false,
}: { lifecycle?: boolean; buddiesAvailable?: boolean } = {}) {
  const { isTablet } = useDevice()
  const { hasAnnualGoal, showsTimer } = usePublisher()
  // Sections this device and User can't show stay in the stored order.
  const isOnScreen = (key: HomeScreenElementKey) =>
    isHomeSectionAvailable(key, {
      isTablet,
      hasAnnualGoal,
      showsTimer,
      mileageTrackingEnabled: usePreferences.getState().mileageTrackingEnabled,
      buddiesAvailable,
    })

  return useEditMode<HomeEditSource>('home', {
    lifecycle,
    snapshot: currentLayout,
    onFinish: ({ source, snapshot }) => {
      const before = snapshot as Layout
      const after = currentLayout()
      const shown = (layout: Layout) =>
        layout.order.filter((key) => !layout.hidden.includes(key))
      const moved = shown(before)
        .filter((key) => !after.hidden.includes(key))
        .join()
      const kept = shown(after)
        .filter((key) => !before.hidden.includes(key))
        .join()
      const hidden = after.hidden.filter(
        (key) => !before.hidden.includes(key)
      ).length
      const unhidden = before.hidden.filter(
        (key) => !after.hidden.includes(key)
      ).length
      if (moved === kept && !hidden && !unhidden) return
      analytics.capture('home_screen_customized', {
        source,
        sections: shown(after).filter(isOnScreen).join(','),
        hidden,
        shown: unhidden,
        moved: moved !== kept,
      })
    },
  })
}
