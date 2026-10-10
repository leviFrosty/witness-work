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
import { Mic as MicIcon } from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  DISPLAY_FONT_SCALE_CAP,
  EASE_OUT,
} from '@/features/onboarding/constants/welcome'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import { RevealPage } from '@/features/updates/hooks/useRevealPages'
import {
  IconTile,
  VISUAL,
} from '@/features/updates/components/reveal/visuals/kit'
import MoreVisual from '@/features/updates/components/reveal/visuals/MoreVisual'

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
  const calloutStyle = useAnimatedStyle(() => {
    const p = clamp((appear.value - 0.45) / 0.55, 0, 1)
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * 10 * drift }],
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
            {page.tiles ? (
              <MoreVisual {...visualProps} tiles={page.tiles} />
            ) : (
              page.Visual && <page.Visual {...visualProps} />
            )}
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
        {page.callout && (
          <Animated.View
            accessible
            accessibilityLabel={`${i18n.t('updateReveal_siri_tryLabel')} ${page.callout}`}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 10,
                marginTop: 4,
                paddingVertical: 10,
                paddingLeft: 12,
                paddingRight: 16,
                borderRadius: 16,
                borderCurve: 'continuous',
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.surfaceBorder,
              },
              calloutStyle,
            ]}
          >
            <LucideIcon icon={MicIcon} size={18} color={page.color} />
            <View style={{ flexShrink: 1 }}>
              <Text
                maxFontSizeMultiplier={DISPLAY_FONT_SCALE_CAP}
                style={{
                  fontSize: 12,
                  fontFamily: theme.fonts.semiBold,
                  color: palette.textAlt,
                }}
              >
                {i18n.t('updateReveal_siri_tryLabel')}
              </Text>
              <Text
                maxFontSizeMultiplier={DISPLAY_FONT_SCALE_CAP}
                style={{
                  fontSize: 16,
                  lineHeight: 21,
                  fontFamily: theme.fonts.bold,
                  color: palette.text,
                }}
              >
                {page.callout}
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  )
}

export default RevealTourPage
