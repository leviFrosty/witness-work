import { useState } from 'react'
import { LayoutChangeEvent, View } from 'react-native'
import { ArrowForwardIcon } from '@/components/ui/DirectionalIcon'
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { forwardSign, isRtlLayout } from '@/lib/direction'
import { DISPLAY_FONT_SCALE_CAP } from '@/features/onboarding/constants/welcome'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import type WelcomeCtaSheenComponent from '@/features/onboarding/components/welcome/WelcomeCtaSheen'
import { canvasKitComponent } from '@/lib/canvasKit/canvasKitComponent'

const RADIUS = 14
const HEIGHT = 56
const SHEEN_WIDTH = 72
// A sheen crosses every few seconds; the arrow nudges forward with it.
const SHEEN_EVERY = 4.2
const SHEEN_FOR = 1.1

interface Props {
  label: string
  onPress: () => void
  time: SharedValue<number>
  palette: WelcomePalette
  /** Skips the sheen. */
  reduceMotion: boolean
}

/**
 * The welcome's primary action: a glowing button with a passing sheen. Built on
 * `Button` rather than `ActionButton` — the hero's call to action is the one
 * place in onboarding that carries this glow and motion.
 */
const WelcomeCta = ({ label, onPress, time, palette, reduceMotion }: Props) => {
  const theme = useTheme()
  const [width, setWidth] = useState(0)

  const sweep = useDerivedValue(() => {
    const p = (time.value % SHEEN_EVERY) / SHEEN_FOR
    return p >= 1 ? -1 : p
  })
  // Skia doesn't mirror, so the sheen's path is flipped by hand in RTL to
  // travel forward with the arrow.
  const rtl = isRtlLayout()
  const sign = forwardSign()
  const sheen = useDerivedValue(() => {
    const x =
      sweep.value < 0
        ? -SHEEN_WIDTH * 2
        : -SHEEN_WIDTH * 1.5 + sweep.value * (width + SHEEN_WIDTH * 3)
    return [
      { translateX: rtl ? width - x - SHEEN_WIDTH : x },
      { skewX: sign * -0.35 },
    ]
  })
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          sweep.value < 0 ? 0 : sign * Math.sin(sweep.value * Math.PI) * 4,
      },
    ],
  }))

  return (
    <View
      style={{
        borderRadius: RADIUS,
        shadowColor: theme.colors.accent,
        shadowOpacity: palette.ctaGlowOpacity,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      }}
    >
      <Button
        onPress={onPress}
        onLayout={(e: LayoutChangeEvent) =>
          setWidth(e.nativeEvent.layout.width)
        }
        accessibilityRole='button'
        style={{
          height: HEIGHT,
          borderRadius: RADIUS,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.accent,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          overflow: 'hidden',
          // Android has no layer shadow; elevation casts the glow there,
          // tinted by `shadowColor` on Android 9+.
          elevation: 10,
          shadowColor: theme.colors.accent,
        }}
      >
        {width > 0 && !reduceMotion && (
          <WelcomeCtaSheen
            width={width}
            height={HEIGHT}
            sheenWidth={SHEEN_WIDTH}
            transform={sheen}
          />
        )}
        <Text
          maxFontSizeMultiplier={DISPLAY_FONT_SCALE_CAP}
          style={{
            fontSize: 17,
            fontFamily: theme.fonts.bold,
            color: theme.colors.textInverse,
          }}
        >
          {label}
        </Text>
        <Animated.View style={arrowStyle}>
          <LucideIcon
            icon={ArrowForwardIcon}
            size={19}
            strokeWidth={2.6}
            color={theme.colors.textInverse}
          />
        </Animated.View>
      </Button>
    </View>
  )
}

/**
 * The sheen draws with Skia; on the web it shows once CanvasKit has downloaded,
 * and the button works without it.
 */
const WelcomeCtaSheen = canvasKitComponent(
  (): typeof WelcomeCtaSheenComponent =>
    require('@/features/onboarding/components/welcome/WelcomeCtaSheen').default
)

export default WelcomeCta
