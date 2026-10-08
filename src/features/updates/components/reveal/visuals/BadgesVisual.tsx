import { PropsWithChildren } from 'react'
import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { UserRound as UserRoundIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import { badgeTitle } from '@/lib/badges/display'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'
import {
  Bar,
  RevealVisualProps,
  Surface,
  VisualText,
  backOut,
  pulseWindow,
  seg,
  segInOut,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const AVATAR = 46
const MEDAL = 40
const TOAST_MEDAL = 50
/** The collection that grows a level each loop: Silver to Gold. */
const GROWING: { art: BadgeArtId; from: BadgeLevel; to: BadgeLevel } = {
  art: 'monthsShared',
  from: 2,
  to: 3,
}
/** The rest of the profile's row, after the one that grows. */
const SHELF: { art: BadgeArtId; level: BadgeLevel }[] = [
  { art: 'returnVisits', level: 2 },
  { art: 'conversations', level: 1 },
  { art: 'prepared', level: 1 },
]

/**
 * Badges: a profile card whose badges pop in one by one, then one grows from
 * Silver to Gold with a soft shine while a "New badge" note rises beneath it.
 */
const BadgesVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const gold = theme.colors.warn
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1500,
    loopMs: 6400,
    restAt: 0.6,
  })

  const cardStyle = useRiseStyle(intro, 0, 0.35, 20)
  // Silver gives way to Gold, and back while nothing is watching it.
  const grown = useDerivedValue(
    () => seg(loop.value, 0.16, 0.28) * (1 - seg(loop.value, 0.93, 0.99))
  )
  const toast = useDerivedValue(() =>
    pulseWindow(loop.value, 0.3, 0.42, 0.82, 0.9)
  )
  const toastStyle = useAnimatedStyle(() => ({
    opacity: toast.value,
    transform: [{ translateY: (1 - backOut(toast.value)) * 16 }],
  }))

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          { position: 'absolute', top: 12, left: 8, right: 8 },
          cardStyle,
        ]}
      >
        <Surface palette={palette} style={{ padding: 14, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: AVATAR,
                height: AVATAR,
                borderRadius: AVATAR / 2,
                backgroundColor: withAlpha(theme.colors.accent, 0x2e),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LucideIcon
                icon={UserRoundIcon}
                size={AVATAR * 0.5}
                color={theme.colors.accent}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Bar palette={palette} width={128} height={10} />
              <Bar palette={palette} width={84} height={7} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PopIn intro={intro} index={0}>
              <GrowingMedallion
                loop={loop}
                grown={grown}
                glow={gold}
                size={MEDAL}
              />
            </PopIn>
            {SHELF.map(({ art, level }, i) => (
              <PopIn key={art} intro={intro} index={i + 1}>
                <BadgeMedallion art={art} level={level} size={MEDAL} />
              </PopIn>
            ))}
          </View>
        </Surface>
      </Animated.View>

      <Animated.View
        style={[
          { position: 'absolute', top: 172, left: 30, right: 30 },
          toastStyle,
        ]}
      >
        <Surface
          palette={palette}
          style={{
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <BadgeMedallion
            art={GROWING.art}
            level={GROWING.to}
            size={TOAST_MEDAL}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <VisualText style={{ fontSize: 12, color: palette.textAlt }}>
              {i18n.t('badges_newBadge')}
            </VisualText>
            <VisualText
              numberOfLines={2}
              style={{
                fontSize: 14,
                lineHeight: 18,
                fontFamily: theme.fonts.bold,
                color: palette.text,
              }}
            >
              {badgeTitle(GROWING.art, GROWING.to)}
            </VisualText>
          </View>
        </Surface>
      </Animated.View>
    </View>
  )
}

/** Pops a medallion into the row, one after another, as the scene builds. */
const PopIn = ({
  intro,
  index,
  children,
}: PropsWithChildren<{ intro: DerivedValue<number>; index: number }>) => {
  const style = useAnimatedStyle(() => {
    const from = 0.32 + index * 0.12
    const p = seg(intro.value, from, from + 0.28)
    return {
      opacity: Math.min(1, p * 2),
      transform: [{ scale: 0.4 + 0.6 * backOut(p) }],
    }
  })
  return <Animated.View style={style}>{children}</Animated.View>
}

/**
 * The medallion that grows: a warm glow swells behind it, it lifts as Gold
 * replaces Silver, and a band of light sweeps across the new metal.
 */
const GrowingMedallion = ({
  loop,
  grown,
  glow,
  size,
}: {
  loop: DerivedValue<number>
  grown: DerivedValue<number>
  glow: string
  size: number
}) => {
  const glowStyle = useAnimatedStyle(() => {
    const g = pulseWindow(loop.value, 0.18, 0.3, 0.46, 0.7)
    return { opacity: g * 0.9, transform: [{ scale: 0.7 + 0.45 * g }] }
  })
  const liftStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + 0.16 * Math.sin(Math.PI * seg(loop.value, 0.12, 0.34)) },
    ],
  }))
  const goldStyle = useAnimatedStyle(() => ({ opacity: grown.value }))
  const shineStyle = useAnimatedStyle(() => {
    const s = segInOut(loop.value, 0.22, 0.42)
    return {
      opacity: Math.sin(Math.PI * s),
      transform: [
        { translateX: -size * 0.6 + s * size * 1.4 },
        { rotate: '20deg' },
      ],
    }
  })
  const fill = { position: 'absolute', top: 0, left: 0 } as const

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -size * 0.3,
            left: -size * 0.3,
            width: size * 1.6,
            height: size * 1.6,
            borderRadius: size * 0.8,
            backgroundColor: withAlpha(glow, 0x55),
          },
          glowStyle,
        ]}
      />
      <Animated.View style={[{ width: size, height: size }, liftStyle]}>
        <BadgeMedallion art={GROWING.art} level={GROWING.from} size={size} />
        <Animated.View style={[fill, goldStyle]}>
          <BadgeMedallion art={GROWING.art} level={GROWING.to} size={size} />
        </Animated.View>
        <View
          style={[
            fill,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              overflow: 'hidden',
            },
          ]}
        >
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: -size * 0.25,
                width: size * 0.3,
                height: size * 1.5,
                backgroundColor: 'rgba(255,255,255,0.55)',
              },
              shineStyle,
            ]}
          />
        </View>
      </Animated.View>
    </View>
  )
}

export default BadgesVisual
