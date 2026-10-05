import { useState } from 'react'
import {
  LayoutChangeEvent,
  LayoutRectangle,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import { DISPLAY_FONT_SCALE_CAP } from '@/features/onboarding/constants/welcome'
import { Tilt } from '@/features/onboarding/hooks/useWelcomeMotion'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import WelcomeCta from '@/features/onboarding/components/welcome/WelcomeCta'
import { HeadlineLine } from '@/features/onboarding/components/welcome/WelcomeHeadline'
import { UPDATE_REVEAL_NAME } from '@/features/updates/constants/updateReveal'
import { RevealHeadline } from '@/features/updates/hooks/useRevealChoreography'
import { RevealChip } from '@/features/updates/hooks/useRevealPages'
import RevealChips from '@/features/updates/components/reveal/RevealChips'

interface Props {
  palette: WelcomePalette
  time: SharedValue<number>
  tilt: Tilt
  /** Hub centre and scene scale, once the stage is measured. */
  hub: { x: number; y: number } | null
  scale: number
  /** Reports the stage — the space above the copy the scene centres in. */
  onStage: (stage: LayoutRectangle) => void
  chips: RevealChip[]
  headline: RevealHeadline
  values: {
    burst: SharedValue<number>
    kicker: SharedValue<number>
    cta: SharedValue<number>
    link: SharedValue<number>
    exit: SharedValue<number>
  }
  stage: LayoutRectangle | null
  skippable: boolean
  reduceMotion: boolean
  onSkip: () => void
  onSeeWhatsNew: () => void
  onLater: () => void
}

/**
 * The reveal's opening scene, above the shared aurora: the feature chips around
 * the tile, the greeting giving way to the news, and the way into the tour. The
 * tile itself is drawn by the overlay's curtain, on top.
 */
const RevealIntro = ({
  palette,
  time,
  tilt,
  hub,
  scale,
  onStage,
  chips,
  headline,
  values,
  stage,
  skippable,
  reduceMotion,
  onSkip,
  onSeeWhatsNew,
  onLater,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const [heights, setHeights] = useState<Record<string, number>>({})
  const { burst, kicker, cta, link, exit } = values

  const fontSize = Math.round(Math.min(44, Math.max(32, window.width * 0.094)))
  const lines = [
    { id: 'welcome', text: i18n.t('updateReveal_welcomeBack') },
    { id: 'news', text: i18n.t('updateReveal_news') },
  ] as const
  const tallest = Math.max(fontSize * 1.14, ...Object.values(heights))

  // Under Reduce Motion the exit is a plain fade.
  const drift = reduceMotion ? 0 : 1
  const copyStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.value,
    transform: [{ translateY: -exit.value * 16 * drift }],
  }))
  const kickerStyle = useAnimatedStyle(() => ({
    opacity: kicker.value,
    transform: [{ translateY: (1 - kicker.value) * 10 * drift }],
  }))
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, cta.value),
    transform: [
      { translateY: (1 - cta.value) * 28 },
      { scale: 0.96 + 0.04 * cta.value },
    ],
  }))
  const linkStyle = useAnimatedStyle(() => ({ opacity: link.value }))

  return (
    <View style={{ flex: 1 }}>
      {hub && (
        <RevealChips
          hub={hub}
          scale={scale}
          chips={chips}
          palette={palette}
          time={time}
          tilt={tilt}
          burst={burst}
          exit={exit}
          reduceMotion={reduceMotion}
        />
      )}
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 20),
        }}
      >
        <View
          style={{ flex: 1 }}
          onLayout={(e: LayoutChangeEvent) => onStage(e.nativeEvent.layout)}
        />
        <Animated.View
          style={[
            {
              width: '100%',
              maxWidth: 560,
              alignSelf: 'center',
              paddingHorizontal: 24,
              paddingBottom: 4,
            },
            copyStyle,
          ]}
        >
          <Animated.View
            style={[{ flexDirection: 'row', marginBottom: 14 }, kickerStyle]}
          >
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: withAlpha(theme.colors.accent, 0x26),
              }}
            >
              <Text
                maxFontSizeMultiplier={DISPLAY_FONT_SCALE_CAP}
                style={{
                  fontSize: 12,
                  letterSpacing: 1.2,
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.accent,
                  textTransform: 'uppercase',
                }}
              >
                {i18n.t(UPDATE_REVEAL_NAME)}
              </Text>
            </View>
          </Animated.View>
          <View
            accessible
            accessibilityRole='header'
            accessibilityLabel={lines.map((line) => line.text).join(' ')}
            style={{ height: tallest }}
          >
            {lines.map((line) => (
              <HeadlineLine
                key={line.id}
                text={line.text}
                current={headline === line.id}
                enterDelay={0}
                highlight=''
                palette={palette}
                fontSize={fontSize}
                reduceMotion={reduceMotion}
                onHeight={(height) =>
                  setHeights((prev) =>
                    prev[line.id] === height
                      ? prev
                      : { ...prev, [line.id]: height }
                  )
                }
              />
            ))}
          </View>
          <Animated.View style={[{ marginTop: 28 }, ctaStyle]}>
            <WelcomeCta
              label={i18n.t('updateReveal_seeWhatsNew')}
              onPress={onSeeWhatsNew}
              time={time}
              palette={palette}
              reduceMotion={reduceMotion}
            />
          </Animated.View>
          <Animated.View
            style={[{ marginTop: 10, alignItems: 'center' }, linkStyle]}
          >
            <Button
              onPress={onLater}
              accessibilityRole='button'
              style={{ paddingVertical: 10, paddingHorizontal: 16 }}
            >
              <Text
                maxFontSizeMultiplier={DISPLAY_FONT_SCALE_CAP}
                style={{
                  fontSize: 15,
                  fontFamily: theme.fonts.medium,
                  color: palette.textAlt,
                }}
              >
                {i18n.t('updateReveal_later')}
              </Text>
            </Button>
          </Animated.View>
        </Animated.View>
      </View>
      {skippable && stage && (
        // Tapping the scene hurries the intro along; the copy and buttons
        // below stay out of its way.
        <Pressable
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: stage.y + stage.height,
          }}
          onPress={onSkip}
          accessible={false}
        />
      )}
    </View>
  )
}

export default RevealIntro
