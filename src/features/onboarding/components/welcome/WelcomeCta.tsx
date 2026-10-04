import { useState } from 'react'
import { LayoutChangeEvent, View } from 'react-native'
import { ArrowRight as ArrowRightIcon } from 'lucide-react-native'
import {
  Canvas,
  Group,
  LinearGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia'
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { DISPLAY_FONT_SCALE_CAP } from '@/features/onboarding/constants/welcome'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'

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
  const sheen = useDerivedValue(() => [
    {
      translateX:
        sweep.value < 0
          ? -SHEEN_WIDTH * 2
          : -SHEEN_WIDTH * 1.5 + sweep.value * (width + SHEEN_WIDTH * 3),
    },
    { skewX: -0.35 },
  ])
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: sweep.value < 0 ? 0 : Math.sin(sweep.value * Math.PI) * 4,
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
          <Canvas
            pointerEvents='none'
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width,
              height: HEIGHT,
            }}
          >
            <Group transform={sheen}>
              <Rect x={0} y={0} width={SHEEN_WIDTH} height={HEIGHT}>
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(SHEEN_WIDTH, 0)}
                  colors={[
                    'rgba(255,255,255,0)',
                    'rgba(255,255,255,0.4)',
                    'rgba(255,255,255,0)',
                  ]}
                />
              </Rect>
            </Group>
          </Canvas>
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
            icon={ArrowRightIcon}
            size={19}
            strokeWidth={2.6}
            color={theme.colors.textInverse}
          />
        </Animated.View>
      </Button>
    </View>
  )
}

export default WelcomeCta
