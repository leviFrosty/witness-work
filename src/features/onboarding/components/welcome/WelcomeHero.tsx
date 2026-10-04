import { useState } from 'react'
import {
  LayoutChangeEvent,
  LayoutRectangle,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated'
import LaunchSplash, { splashMarkWidth } from '@/app/launch/LaunchSplash'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  DISPLAY_FONT_SCALE_CAP,
  PILLARS,
  PILLAR_HOLD_MS,
  PillarId,
  STAGE,
  STAGE_INSET,
  STAGE_SCALE,
} from '@/features/onboarding/constants/welcome'
import useWelcomeChoreography from '@/features/onboarding/hooks/useWelcomeChoreography'
import useWelcomeMotion from '@/features/onboarding/hooks/useWelcomeMotion'
import { getWelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import WelcomeBackdrop from '@/features/onboarding/components/welcome/WelcomeBackdrop'
import WelcomeConstellation from '@/features/onboarding/components/welcome/WelcomeConstellation'
import WelcomeCta from '@/features/onboarding/components/welcome/WelcomeCta'
import WelcomeCurtain from '@/features/onboarding/components/welcome/WelcomeCurtain'
import WelcomeHeadline from '@/features/onboarding/components/welcome/WelcomeHeadline'

interface Props {
  onGetStarted: () => void
  onReturningUser: () => void
}

/**
 * The first onboarding screen. The splash screen collapses into the app tile, a
 * constellation of the app's tools bursts out of it, and the headline greets
 * the user before telling the app's story — plan, track, visits, report,
 * progress — while the matching card steps forward.
 */
const WelcomeHero = ({ onGetStarted, onReturningUser }: Props) => {
  const theme = useTheme()
  const palette = getWelcomePalette(theme)
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const isFocused = useIsFocused()

  const [root, setRoot] = useState<{ width: number; height: number } | null>(
    null
  )
  const [stage, setStage] = useState<LayoutRectangle | null>(null)
  const size = root ?? window
  const hub = stage
    ? { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 }
    : null
  const scale = stage
    ? Math.min(
        STAGE_SCALE.max,
        Math.max(
          STAGE_SCALE.min,
          Math.min(
            (stage.width - STAGE_INSET * 2) / STAGE.width,
            stage.height / STAGE.height
          )
        )
      )
    : 1

  const { time, tilt } = useWelcomeMotion(isFocused && !reduceMotion)
  const {
    values,
    headline,
    firstLineDelay,
    splashVisible,
    skippable,
    skipIntro,
    leave,
  } = useWelcomeChoreography({
    ready: root !== null && hub !== null,
    reduceMotion,
    isFocused,
  })
  const { exit, subtitle, cta, link, splash } = values

  const headlineSize = Math.round(
    Math.min(44, Math.max(32, window.width * 0.094))
  )
  const brand = i18n.t('witnessWork')
  const lines = [
    {
      id: 'welcome' as const,
      text: i18n.t('onboardingHeroWelcome', { appName: brand }),
    },
    ...PILLARS.map((pillar) => ({
      id: pillar.id,
      text: i18n.t(pillar.titleKey),
    })),
  ]
  const activePillar: PillarId | null = headline === 'welcome' ? null : headline

  // Under Reduce Motion the exit (and its reverse) is a plain fade.
  const drift = reduceMotion ? 0 : 1
  const headlineStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.value,
    transform: [{ translateY: -exit.value * 12 * drift }],
  }))
  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitle.value * (1 - exit.value),
    transform: [
      { translateY: ((1 - subtitle.value) * 12 - exit.value * 12) * drift },
    ],
  }))
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, cta.value) * (1 - exit.value),
    transform: [
      { translateY: (1 - cta.value) * 28 },
      { scale: 0.96 + 0.04 * cta.value },
    ],
  }))
  const linkStyle = useAnimatedStyle(() => ({
    opacity: link.value * (1 - exit.value),
  }))
  // Fades the scene into the next step's background on the way out.
  const veilStyle = useAnimatedStyle(() => ({ opacity: exit.value }))
  const splashStyle = useAnimatedStyle(() => ({ opacity: splash.value }))

  return (
    <View
      style={{ flex: 1, backgroundColor: palette.base }}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout
        setRoot((prev) =>
          prev?.width === width && prev?.height === height
            ? prev
            : { width, height }
        )
      }}
    >
      {hub && (
        <WelcomeBackdrop
          width={size.width}
          height={size.height}
          hub={hub}
          scale={scale}
          palette={palette}
          time={time}
          tilt={tilt}
          reveal={values.reveal}
          orbits={values.orbits}
          ringStart={values.ringStart}
          ringEnd={values.ringEnd}
          pulse={values.pulse}
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
          onLayout={(e: LayoutChangeEvent) => {
            const layout = e.nativeEvent.layout
            setStage((prev) =>
              prev?.x === layout.x &&
              prev?.y === layout.y &&
              prev?.width === layout.width &&
              prev?.height === layout.height
                ? prev
                : layout
            )
          }}
        />
        <View
          style={{
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
            paddingHorizontal: 24,
            paddingBottom: 4,
          }}
        >
          <Animated.View style={headlineStyle}>
            <WelcomeHeadline
              lines={lines}
              current={headline}
              firstLineDelay={firstLineDelay}
              highlight={brand}
              palette={palette}
              fontSize={headlineSize}
              holdMs={PILLAR_HOLD_MS}
              reduceMotion={reduceMotion}
            />
          </Animated.View>
          <Animated.View style={subtitleStyle}>
            <Text
              maxFontSizeMultiplier={DISPLAY_FONT_SCALE_CAP}
              style={{
                marginTop: 12,
                fontSize: 17,
                fontFamily: theme.fonts.medium,
                color: palette.textAlt,
              }}
            >
              {i18n.t('onboardingHeroTagline')}
            </Text>
          </Animated.View>
          <Animated.View style={[{ marginTop: 28 }, ctaStyle]}>
            <WelcomeCta
              label={i18n.t('getStarted')}
              onPress={() => leave(onGetStarted)}
              time={time}
              palette={palette}
              reduceMotion={reduceMotion}
            />
          </Animated.View>
          <Animated.View
            style={[{ marginTop: 10, alignItems: 'center' }, linkStyle]}
          >
            <Button
              onPress={() => leave(onReturningUser)}
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
                {i18n.t('onboardingHeroReturningLink')}
              </Text>
            </Button>
          </Animated.View>
        </View>
      </View>
      {hub && (
        <WelcomeConstellation
          hub={hub}
          scale={scale}
          palette={palette}
          time={time}
          tilt={tilt}
          burst={values.burst}
          exit={exit}
          activePillar={activePillar}
          reduceMotion={reduceMotion}
        />
      )}
      <WelcomeCurtain
        width={size.width}
        height={size.height}
        hub={hub}
        scale={scale}
        splashMarkWidth={splashMarkWidth(window)}
        palette={palette}
        collapse={values.collapse}
        tileScale={values.tileScale}
        ripple={values.ripple}
        tilt={tilt}
        exit={exit}
        reduceMotion={reduceMotion}
      />
      {splashVisible && (
        <Animated.View
          pointerEvents='none'
          style={[StyleSheet.absoluteFill, splashStyle]}
        >
          <LaunchSplash />
        </Animated.View>
      )}
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
          onPress={skipIntro}
          accessible={false}
        />
      )}
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

export default WelcomeHero
