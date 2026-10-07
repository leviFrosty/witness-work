import { useEffect, useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import { badgeTitle } from '@/lib/badges/display'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import {
  COMPACT_WINDOW_HEIGHT,
  FLOAT_MS,
  PREVIEW_BADGE,
  STAGE,
  STAGE_INSET,
  STAGE_SCALE,
  T,
} from '@/features/onboarding/constants/badgesPreview'
import SharedCheckTile from '@/features/onboarding/components/badges-preview/SharedCheckTile'
import NewBadgeCard from '@/features/onboarding/components/badges-preview/NewBadgeCard'
import BadgeShareChip from '@/features/onboarding/components/badges-preview/BadgeShareChip'
import SoftGlow from '@/features/onboarding/components/badges-preview/SoftGlow'

/** The step's horizontal padding: the first guess at the preview's width. */
const STEP_PADDING = 20
const POOL_SIZE = 340

/**
 * Acts out earning a badge: a "Shared the Good News" checkbox is tapped, the
 * New badge card springs up with the real medallion, a light sweep and a little
 * confetti, then a chip shows who else sees it (buddies where Buddies is
 * available, otherwise the profile). It plays once, with one light haptic as
 * the medallion lands, then settles. Reduce Motion shows the earned card,
 * still. One accessibility label describes the whole scene.
 */
const BadgesPreview = ({ buddies }: { buddies: boolean }) => {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const screen = useWindowDimensions()
  const t = useSharedValue<number>(reduceMotion ? T.settle : 0)
  const idle = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(t)
      cancelAnimation(idle)
      t.value = T.settle
      idle.value = 0
      return
    }
    t.value = 0
    t.value = withTiming(T.settle, {
      duration: T.settle,
      easing: Easing.linear,
    })
    idle.value = withDelay(
      T.settle,
      withRepeat(
        withTiming(1, { duration: FLOAT_MS, easing: Easing.linear }),
        -1,
        false
      )
    )
    const landed = setTimeout(() => {
      Haptics.light().catch(() => {})
    }, T.landed)
    return () => {
      clearTimeout(landed)
      cancelAnimation(t)
      cancelAnimation(idle)
    }
  }, [reduceMotion, t, idle])

  const [width, setWidth] = useState(screen.width - STEP_PADDING * 2)
  const scale = Math.min(
    STAGE_SCALE.max,
    (width - STAGE_INSET * 2) / STAGE.width,
    screen.height < COMPACT_WINDOW_HEIGHT ? STAGE_SCALE.compact : Infinity
  )
  const height = STAGE.height * scale + STAGE_INSET * 2
  const badge = badgeTitle(PREVIEW_BADGE.art, PREVIEW_BADGE.level)
  // The settled card and its chip float together.
  const floatStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: reduceMotion ? 0 : Math.sin(idle.value * Math.PI * 2) * 2,
      },
    ],
  }))

  return (
    <View
      accessible
      accessibilityRole='image'
      accessibilityLabel={i18n.t(
        buddies
          ? 'onboardingBadges_previewA11y'
          : 'onboardingBadges_previewA11yNoBuddies',
        { badge }
      )}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        height,
        borderRadius: theme.numbers.borderRadiusLg,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.backgroundLighter,
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: 'hidden',
        shadowColor: theme.colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 4,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility='no-hide-descendants'
        pointerEvents='none'
        style={{
          position: 'absolute',
          left: (width - STAGE.width) / 2,
          top: (height - STAGE.height) / 2,
          width: STAGE.width,
          height: STAGE.height,
          transform: [{ scale }],
        }}
      >
        {/* A soft pool of warm light where the badge arrives. */}
        <SoftGlow
          size={POOL_SIZE}
          color={theme.colors.warn}
          opacity={0.16}
          style={{
            left: (STAGE.width - POOL_SIZE) / 2,
            top: (STAGE.height - POOL_SIZE) / 2,
          }}
        />
        <SharedCheckTile t={t} />
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { alignItems: 'center', justifyContent: 'center' },
            floatStyle,
          ]}
        >
          <NewBadgeCard t={t} idle={idle} reduceMotion={reduceMotion} />
          <BadgeShareChip t={t} buddies={buddies} />
        </Animated.View>
      </View>
    </View>
  )
}

export default BadgesPreview
