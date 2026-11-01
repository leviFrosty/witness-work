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

export default function useHomeEditing({
  lifecycle = false,
  buddiesAvailable = false,
}: { lifecycle?: boolean; buddiesAvailable?: boolean } = {}) {
  const { isTablet } = useDevice()
  const { hasAnnualGoal, showsTimer } = usePublisher()

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
