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
import { withAlpha } from '@/lib/color'
import { forwardSign, isRtlLayout } from '@/lib/direction'
import { DISPLAY_FONT_SCALE_CAP } from '@/features/onboarding/constants/welcome'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'

const RADIUS = 14
const HEIGHT = 56
const SHEEN_WIDTH = 72

const SHEEN_EVERY = 4.2
const SHEEN_FOR = 1.1
const SHEEN_GRADIENT =
  'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.4), rgba(255,255,255,0))'

interface Props {
  label: string
  onPress: () => void
  time: SharedValue<number>
  palette: WelcomePalette

  reduceMotion: boolean
}

const WelcomeCta = ({ label, onPress, time, palette, reduceMotion }: Props) => {
  const theme = useTheme()
  const [width, setWidth] = useState(0)

  const sweep = useDerivedValue(() => {
    const p = (time.value % SHEEN_EVERY) / SHEEN_FOR
    return p >= 1 ? -1 : p
  })

  const rtl = isRtlLayout()
  const sign = forwardSign()
  const sheenStyle = useAnimatedStyle(() => {
    const x =
      sweep.value < 0
        ? -SHEEN_WIDTH * 2
        : -SHEEN_WIDTH * 1.5 + sweep.value * (width + SHEEN_WIDTH * 3)
    return {
      opacity: sweep.value < 0 ? 0 : 1,
      transform: [
        { translateX: rtl ? width - x - SHEEN_WIDTH : x },
        { skewX: `${sign * -0.35}rad` },
      ],
    }
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
        boxShadow: `0 8px 18px ${withAlpha(
          theme.colors.accent,
          Math.round(palette.ctaGlowOpacity * 255)
        )}`,
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

          elevation: 10,
          shadowColor: theme.colors.accent,
        }}
      >
        {width > 0 && !reduceMotion && (
          <Animated.View
            pointerEvents='none'
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: SHEEN_WIDTH,
                height: HEIGHT,
                backgroundImage: SHEEN_GRADIENT,
              },
              sheenStyle,
            ]}
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

export default WelcomeCta
