import { useEffect, useState } from 'react'
import { LayoutChangeEvent, View } from 'react-native'
import Animated, {
  SharedValue,
  clamp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Text from '@/components/ui/MyText'
import type { AppIcon } from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import {
  DISPLAY_FONT_SCALE_CAP,
  EASE_OUT,
} from '@/features/onboarding/constants/welcome'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import {
  IconTile,
  VISUAL,
} from '@/features/updates/components/reveal/visuals/kit'
import PlanVisual from '@/features/plans/components/schedule-intro/PlanVisual'
import StreakVisual from '@/features/plans/components/schedule-intro/StreakVisual'
import GraceVisual from '@/features/plans/components/schedule-intro/GraceVisual'
import TogetherVisual from '@/features/plans/components/schedule-intro/TogetherVisual'

/** One page of the intro. Its id is also its analytics value. */
export type ScheduleIntroPageId = 'plan' | 'streak' | 'grace' | 'together'

export type ScheduleIntroPageSpec = {
  id: ScheduleIntroPageId
  icon: AppIcon
  color: string
  title: string
  caption: string
}

const VISUAL_SCALE = { min: 0.62, max: 1.4 }
const VISUAL_INSET = 20

const VISUALS = {
  plan: PlanVisual,
  streak: StreakVisual,
  grace: GraceVisual,
  together: TogetherVisual,
}

interface Props {
  page: ScheduleIntroPageSpec
  index: number
  width: number
  height: number
  scrollX: SharedValue<number>
  active: boolean
  palette: WelcomePalette
  reduceMotion: boolean
}

/**
 * One page: the illustration, as large as its stage allows, over a title and
 * caption that rise in the first time the page arrives. Laid out like the
 * update reveal's tour.
 */
export default function ScheduleIntroPage({
  page,
  index,
  width,
  height,
  scrollX,
  active,
  palette,
  reduceMotion,
}: Props) {
  const theme = useTheme()
  const [stage, setStage] = useState<{ width: number; height: number } | null>(
    null
  )
  const appear = useSharedValue(reduceMotion ? 1 : 0)
  const Visual = VISUALS[page.id]

  useEffect(() => {
    if (!active || appear.value > 0) return
    appear.value = withDelay(
      120,
      withTiming(1, { duration: 650, easing: EASE_OUT })
    )
  }, [active, appear])

  const scale = stage
    ? clamp(
        Math.min(
          (stage.width - VISUAL_INSET * 2) / VISUAL.width,
          stage.height / VISUAL.height
        ),
        VISUAL_SCALE.min,
        VISUAL_SCALE.max
      )
    : 1
  const drift = reduceMotion ? 0 : 1

  const visualStyle = useAnimatedStyle(() => {
    const offset = (scrollX.value - index * width) / Math.max(1, width)
    const away = Math.min(1, Math.abs(offset))
    return {
      opacity: 1 - Math.min(1, away / 0.6),
      transform: [
        { translateX: offset * width * 0.3 * drift },
        { scale: scale * (1 - away * 0.08 * drift) },
      ],
    }
  })
  const iconStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ scale: 0.6 + 0.4 * appear.value }],
  }))
  const titleStyle = useAnimatedStyle(() => {
    const p = clamp((appear.value - 0.1) / 0.7, 0, 1)
    return { opacity: p, transform: [{ translateY: (1 - p) * 16 * drift }] }
  })
  const captionStyle = useAnimatedStyle(() => {
    const p = clamp((appear.value - 0.3) / 0.7, 0, 1)
    return { opacity: p, transform: [{ translateY: (1 - p) * 12 * drift }] }
  })

  return (
    <View style={{ width, height }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility='no-hide-descendants'
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        onLayout={(e: LayoutChangeEvent) => {
          const { width: w, height: h } = e.nativeEvent.layout
          setStage((prev) =>
            prev?.width === w && prev?.height === h
              ? prev
              : { width: w, height: h }
          )
        }}
      >
        {stage && (
          <Animated.View
            style={[
              { width: VISUAL.width, height: VISUAL.height },
              visualStyle,
            ]}
          >
            <Visual
              palette={palette}
              active={active}
              reduceMotion={reduceMotion}
            />
          </Animated.View>
        )}
      </View>
      <View
        style={{
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
          paddingHorizontal: 24,
          paddingTop: 12,
          gap: 10,
        }}
      >
        <Animated.View style={[{ flexDirection: 'row' }, iconStyle]}>
          <IconTile icon={page.icon} color={page.color} size={34} />
        </Animated.View>
        <Animated.View style={titleStyle}>
          <Text
            accessibilityRole='header'
            maxFontSizeMultiplier={DISPLAY_FONT_SCALE_CAP}
            style={{
              fontSize: 32,
              lineHeight: 37,
              letterSpacing: -0.8,
              fontFamily: theme.fonts.bold,
              color: palette.text,
            }}
          >
            {page.title}
          </Text>
        </Animated.View>
        <Animated.View style={captionStyle}>
          <Text
            maxFontSizeMultiplier={DISPLAY_FONT_SCALE_CAP}
            style={{
              fontSize: 17,
              lineHeight: 23,
              fontFamily: theme.fonts.medium,
              color: palette.textAlt,
            }}
          >
            {page.caption}
          </Text>
        </Animated.View>
      </View>
    </View>
  )
}
