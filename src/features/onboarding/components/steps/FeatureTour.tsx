import { useEffect, useRef, useState } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { EASE_OUT } from '@/features/onboarding/constants/welcome'
import useWelcomeMotion from '@/features/onboarding/hooks/useWelcomeMotion'
import useTourPages from '@/features/onboarding/hooks/useTourPages'
import { getWelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import WelcomeBackdrop from '@/features/onboarding/components/welcome/WelcomeBackdrop'
import { RevealPage } from '@/features/updates/hooks/useRevealPages'
import RevealTour from '@/features/updates/components/reveal/RevealTour'

/** How the tour was left. Bounded, safe as an analytics value. */
type CloseMethod = 'finished' | 'skipped' | 'back'

interface Props {
  goBack: () => void
  goNext: () => void
  buddiesAvailable: boolean
}

/**
 * Right after the welcome, before asking for anything: a tour of what
 * WitnessWork does, in the update reveal's style — a page per feature, mostly
 * picture, over the welcome's aurora. Skip is always one tap away; setup comes
 * after.
 */
const FeatureTour = ({ goBack, goNext, buddiesAvailable }: Props) => {
  const theme = useTheme()
  const palette = getWelcomePalette(theme)
  const reduceMotion = useReducedMotion()
  const isFocused = useIsFocused()
  const { time, tilt } = useWelcomeMotion(isFocused && !reduceMotion)
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null
  )

  // Buddies' flag can still be loading as the tour opens. Pages may change
  // until the first swipe, then hold, so none shifts under the user.
  const livePages = useTourPages(buddiesAvailable)
  const [heldPages, setHeldPages] = useState<RevealPage[] | null>(null)
  const pages = heldPages ?? livePages

  // The welcome fades out to the app's background; the tour fades in from it.
  const veil = useSharedValue(1)
  const scene = useSharedValue(reduceMotion ? 1 : 0)
  const still = useSharedValue(0)
  useEffect(() => {
    veil.value = withTiming(0, { duration: 450, easing: EASE_OUT })
    scene.value = withTiming(1, { duration: 1200, easing: EASE_OUT })
  }, [veil, scene])
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }))

  const openedAt = useRef(Date.now())
  const viewed = useRef(new Set<string>())
  const lastPage = useRef<string | null>(null)
  const closed = useRef(false)

  const close = (method: CloseMethod) => {
    if (closed.current) return
    closed.current = true
    analytics.capture('onboarding_tour_closed', {
      method,
      pages_viewed: viewed.current.size,
      page_count: pages.length,
      last_page: lastPage.current ?? undefined,
      elapsed_ms: Date.now() - openedAt.current,
    })
    if (method === 'skipped') {
      analytics.capture('onboarding_step_skipped', { step_id: 'featureTour' })
    }
    if (method === 'back') goBack()
    else goNext()
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.base }}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout
        setSize((prev) =>
          prev?.width === width && prev?.height === height
            ? prev
            : { width, height }
        )
      }}
    >
      {size && (
        <WelcomeBackdrop
          width={size.width}
          height={size.height}
          hub={{ x: size.width / 2, y: size.height * 0.4 }}
          scale={1}
          palette={palette}
          time={time}
          tilt={tilt}
          reveal={scene}
          orbits={still}
          ringStart={still}
          ringEnd={still}
          pulse={still}
          chrome={still}
        />
      )}
      <RevealTour
        pages={pages}
        palette={palette}
        time={time}
        reduceMotion={reduceMotion}
        onPageViewed={(id) => {
          if (lastPage.current && lastPage.current !== id && !heldPages)
            setHeldPages(pages)
          viewed.current.add(id)
          lastPage.current = id
        }}
        finish={{ label: i18n.t('continue'), onPress: () => close('finished') }}
        exit={{ label: i18n.t('skip'), onPress: () => close('skipped') }}
        onBackFromStart={() => close('back')}
      />
      <Animated.View
        pointerEvents='none'
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.background },
          veilStyle,
        ]}
      />
    </View>
  )
}

export default FeatureTour
