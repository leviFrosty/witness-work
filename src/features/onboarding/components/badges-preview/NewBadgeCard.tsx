import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { badgeDescription, badgeTitle } from '@/lib/badges/display'
import BadgeShine from '@/features/badges/components/BadgeShine'
import BadgeSpotlight from '@/features/badges/components/BadgeSpotlight'
import {
  CARD,
  COIN_SIZE,
  GLINT_EVERY_MS,
  GLINT_FIRST_MS,
  PREVIEW_BADGE,
  T,
} from '@/features/onboarding/constants/badgesPreview'
import {
  VisualText,
  backOut,
} from '@/features/updates/components/reveal/visuals/kit'
import ConfettiBurst from '@/features/onboarding/components/badges-preview/ConfettiBurst'
import SoftGlow from '@/features/onboarding/components/badges-preview/SoftGlow'
import {
  ease,
  span,
} from '@/features/onboarding/components/badges-preview/motion'

const GLOW_SIZE = 132

/**
 * The New badge card as it springs up when a badge is earned: the real
 * medallion pops in with its sweep of light over a warm glow, a little confetti
 * bursts from it, and the badge's name rises beneath. Once settled the glow
 * breathes and the metal glints now and then.
 */
const NewBadgeCard = ({
  t,
  idle,
  reduceMotion,
}: {
  t: SharedValue<number>
  /** 0→1 on repeat once the story has settled; the glow breathes with it. */
  idle: SharedValue<number>
  reduceMotion: boolean
}) => {
  const theme = useTheme()
  const { art, level } = PREVIEW_BADGE

  const cardStyle = useAnimatedStyle(() => {
    const p = span(t.value, T.cardIn)
    return {
      opacity: Math.min(1, p * 3),
      transform: [
        { translateY: (1 - backOut(p)) * 34 },
        { scale: 0.9 + 0.1 * backOut(p) },
      ],
    }
  })
  const glowStyle = useAnimatedStyle(() => {
    const p = ease(t.value, T.glow)
    const breathe = reduceMotion ? 0 : Math.sin(idle.value * Math.PI * 2)
    return {
      opacity: p * (0.85 + 0.15 * breathe),
      transform: [{ scale: (0.6 + 0.4 * p) * (1 + 0.04 * breathe) }],
    }
  })
  const kickerStyle = useRise(t, T.kicker)
  const titleStyle = useRise(t, T.title)
  const descriptionStyle = useRise(t, T.description)
  const confetti = useDerivedValue(() => span(t.value, T.confetti))

  return (
    <Animated.View
      style={[
        {
          width: CARD.width,
          paddingTop: CARD.padTop,
          paddingHorizontal: CARD.padX,
          paddingBottom: CARD.padBottom,
          alignItems: 'center',
          borderRadius: 24,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          shadowColor: theme.colors.shadow,
          shadowOpacity: 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        },
        cardStyle,
      ]}
    >
      <View style={{ width: COIN_SIZE, height: COIN_SIZE }}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: (COIN_SIZE - GLOW_SIZE) / 2,
              top: (COIN_SIZE - GLOW_SIZE) / 2,
              width: GLOW_SIZE,
              height: GLOW_SIZE,
            },
            glowStyle,
          ]}
        >
          <SoftGlow size={GLOW_SIZE} color={theme.colors.warn} opacity={0.5} />
        </Animated.View>
        <BadgeSpotlight
          art={art}
          level={level}
          size={COIN_SIZE}
          entrance='spring'
          delay={T.coin}
        />
        {reduceMotion ? null : <Glints />}
      </View>
      <Animated.View style={[{ marginTop: 10 }, kickerStyle]}>
        <VisualText
          style={{
            fontSize: 11,
            lineHeight: 14,
            color: theme.colors.accent,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {i18n.t('badges_newBadge')}
        </VisualText>
      </Animated.View>
      <Animated.View style={[{ marginTop: 4 }, titleStyle]}>
        <VisualText
          numberOfLines={2}
          style={{
            fontSize: 15,
            lineHeight: 19,
            fontFamily: theme.fonts.bold,
            color: theme.colors.text,
            textAlign: 'center',
          }}
        >
          {badgeTitle(art, level)}
        </VisualText>
      </Animated.View>
      <Animated.View style={[{ marginTop: 3 }, descriptionStyle]}>
        <VisualText
          numberOfLines={2}
          style={{
            fontSize: 12,
            lineHeight: 16,
            fontFamily: theme.fonts.regular,
            color: theme.colors.textAlt,
            textAlign: 'center',
          }}
        >
          {badgeDescription(art, level)}
        </VisualText>
      </Animated.View>
      {reduceMotion ? null : (
        <ConfettiBurst
          progress={confetti}
          style={{ left: CARD.width / 2, top: CARD.padTop + COIN_SIZE / 2 }}
        />
      )}
    </Animated.View>
  )
}

/** Rises a line of the card into place as `t` passes through `range`. */
const useRise = (t: SharedValue<number>, range: readonly [number, number]) =>
  useAnimatedStyle(() => {
    const p = span(t.value, range)
    return {
      opacity: Math.min(1, p * 1.6),
      transform: [{ translateY: (1 - backOut(p)) * 8 }],
    }
  })

/**
 * Sweeps light across the settled medallion every few seconds, by mounting a
 * fresh `BadgeShine` each time.
 */
const Glints = () => {
  const [glint, setGlint] = useState(0)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    const first = setTimeout(() => {
      setGlint(1)
      interval = setInterval(() => setGlint((n) => n + 1), GLINT_EVERY_MS)
    }, GLINT_FIRST_MS)
    return () => {
      clearTimeout(first)
      if (interval) clearInterval(interval)
    }
  }, [])

  return glint > 0 ? (
    <BadgeShine key={glint} size={COIN_SIZE} duration={1100} />
  ) : null
}

export default NewBadgeCard
