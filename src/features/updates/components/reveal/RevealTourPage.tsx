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
import useTheme from '@/contexts/theme'
import {
  DISPLAY_FONT_SCALE_CAP,
  EASE_OUT,
} from '@/features/onboarding/constants/welcome'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import {
  RevealMoreTile,
  RevealPage,
} from '@/features/updates/hooks/useRevealPages'
import {
  IconTile,
  VISUAL,
} from '@/features/updates/components/reveal/visuals/kit'
import NavigationVisual from '@/features/updates/components/reveal/visuals/NavigationVisual'
import MapVisual from '@/features/updates/components/reveal/visuals/MapVisual'
import BuddiesVisual from '@/features/updates/components/reveal/visuals/BuddiesVisual'
import NotificationsVisual from '@/features/updates/components/reveal/visuals/NotificationsVisual'
import HomeVisual from '@/features/updates/components/reveal/visuals/HomeVisual'
import ContactsVisual from '@/features/updates/components/reveal/visuals/ContactsVisual'
import YearPaceVisual from '@/features/updates/components/reveal/visuals/YearPaceVisual'
import MileageVisual from '@/features/updates/components/reveal/visuals/MileageVisual'
import CalendarVisual from '@/features/updates/components/reveal/visuals/CalendarVisual'
import MoreVisual from '@/features/updates/components/reveal/visuals/MoreVisual'
import AndroidShareVisual from '@/features/updates/components/reveal/visuals/AndroidShareVisual'

/** How small or large an illustration may draw to fill its stage. */
const VISUAL_SCALE = { min: 0.62, max: 1.5 }
/** Side margin kept clear of the illustration. */
const VISUAL_INSET = 20

interface Props {
  page: RevealPage
  index: number
  width: number
  height: number
  /** Horizontal scroll of the tour, for parallax. */
  scrollX: SharedValue<number>
  active: boolean
  palette: WelcomePalette
  moreTiles: RevealMoreTile[]
  reduceMotion: boolean
}

/**
 * One page of the tour: the illustration, as large as its stage allows, over a
 * short title and caption. The illustration trails the swipe a little, so pages
 * feel layered; the copy rises in the first time a page arrives.
 */
const RevealTourPage = ({
  page,
  index,
  width,
  height,
  scrollX,
  active,
  palette,
  moreTiles,
  reduceMotion,
}: Props) => {
  const theme = useTheme()
  const [stage, setStage] = useState<{ width: number; height: number } | null>(
    null
  )
  const appear = useSharedValue(reduceMotion ? 1 : 0)

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
      // Gone by the time it would trail into the next page's space.
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
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * 16 * drift }],
    }
  })
  const captionStyle = useAnimatedStyle(() => {
    const p = clamp((appear.value - 0.3) / 0.7, 0, 1)
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * 12 * drift }],
    }
  })

  const visualProps = { palette, active, reduceMotion }

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
            {page.id === 'navigation' && <NavigationVisual {...visualProps} />}
            {page.id === 'map' && <MapVisual {...visualProps} />}
            {page.id === 'buddies' && <BuddiesVisual {...visualProps} />}
            {page.id === 'notifications' && (
              <NotificationsVisual {...visualProps} />
            )}
            {page.id === 'home' && <HomeVisual {...visualProps} />}
            {page.id === 'contacts' && <ContactsVisual {...visualProps} />}
            {page.id === 'year' && <YearPaceVisual {...visualProps} />}
            {page.id === 'mileage' && <MileageVisual {...visualProps} />}
            {page.id === 'calendar' && <CalendarVisual {...visualProps} />}
            {page.id === 'more' && (
              <MoreVisual {...visualProps} tiles={moreTiles} />
            )}
            {page.id === 'android' && <AndroidShareVisual {...visualProps} />}
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

export default RevealTourPage
