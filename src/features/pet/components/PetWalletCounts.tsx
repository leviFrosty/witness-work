import { useEffect, useRef, type RefObject } from 'react'
import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatNumber } from '@/lib/numbers'
import { CoinIcon } from '@/features/pet/components/GamePixels'
import type { GainPulse } from '@/features/pet/hooks/usePetReveal'
import usePetDark from '@/features/pet/hooks/usePetDark'
import { coinsText, signedAmountText } from '@/features/pet/lib/roomLabels'

/** A "+N" starts this far down over its count's top, then rises `RISE`. */
const START_OVERLAP = 6
const RISE = 14
/** Room on each side of a count for its "+N", which can be wider. */
const FLOAT_SPREAD = 40

/** A gain's gold, readable on the card in light and dark. */
const GAIN_COLOR = { light: '#8a5a00', dark: '#f5c542' }

/**
 * The coins left to spend, as `usePetReveal` shows them: a "+N" rises over the
 * count as it changes, and the coin pops each time it ticks up. One
 * accessibility element. `iconRef` lets coins fly to the icon. `surface` is the
 * colour behind the count: the "+N" sits on it, so it reads over whatever it
 * rises across (the hearts, the card's edge).
 */
export default function PetWalletCounts({
  coins,
  pulse,
  fontSize,
  iconScale,
  iconRef,
  surface,
  color,
}: {
  coins: number
  pulse: GainPulse | null
  fontSize: number
  /** Points per icon pixel; the Shop's by default. */
  iconScale?: number
  iconRef?: RefObject<View | null>
  /** The card's colour by default. */
  surface?: string
  /** The count's colour; the theme's text by default. */
  color?: string
}) {
  const theme = useTheme()
  const pop = useSharedValue(1)
  const last = useRef(coins)
  useEffect(() => {
    const before = last.current
    last.current = coins
    if (!pulse || coins <= before) return
    pop.value = withSequence(
      withTiming(1.35, { duration: 90 }),
      withSpring(1, { damping: 9, stiffness: 260 })
    )
  }, [coins, pulse, pop])
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }))

  return (
    <View
      accessible
      accessibilityLabel={coinsText(coins)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
    >
      <Animated.View ref={iconRef} collapsable={false} style={popStyle}>
        <CoinIcon scale={iconScale} />
      </Animated.View>
      <View>
        <Text
          style={{
            fontSize,
            fontFamily: theme.fonts.semiBold,
            fontVariant: ['tabular-nums'],
            color: color ?? theme.colors.text,
          }}
        >
          {formatNumber(coins)}
        </Text>
        {pulse ? (
          <GainFloat
            key={pulse.id}
            pulse={pulse}
            surface={surface ?? theme.colors.card}
          />
        ) : null}
      </View>
    </View>
  )
}

/** "+20" rising over the count, and fading; a loss is muted and quick. */
function GainFloat({ pulse, surface }: { pulse: GainPulse; surface: string }) {
  const theme = useTheme()
  const dark = usePetDark()
  const progress = useSharedValue(0)
  const loss = pulse.tier === 'loss'
  useEffect(() => {
    progress.value = withTiming(1, { duration: loss ? 1000 : 1600 })
  }, [progress, loss])
  const style = useAnimatedStyle(() => {
    const p = progress.value
    return {
      opacity: p < 0.12 ? p / 0.12 : p > 0.7 ? (1 - p) / 0.3 : 1,
      transform: [{ translateY: START_OVERLAP - RISE * p }],
    }
  })
  return (
    <Animated.View
      pointerEvents='none'
      style={[
        {
          position: 'absolute',
          // Just over the count, wide enough for any amount.
          bottom: '100%',
          start: -FLOAT_SPREAD,
          end: -FLOAT_SPREAD,
          alignItems: 'center',
        },
        style,
      ]}
    >
      <View
        style={{
          backgroundColor: surface,
          borderRadius: 999,
          paddingHorizontal: 5,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontSize: theme.fontSize(pulse.tier === 'big' ? 'md' : 'sm'),
            fontFamily: theme.fonts.bold,
            color: loss
              ? theme.colors.textAlt
              : GAIN_COLOR[dark ? 'dark' : 'light'],
          }}
        >
          {signedAmountText(pulse.delta)}
        </Text>
      </View>
    </Animated.View>
  )
}
