import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import StoreQrCode from '@/components/StoreQrCode'
import links from '@/constants/links'
import i18n from '@/lib/locales'
import {
  RevealVisualProps,
  VISUAL,
  VisualText,
  backOut,
  pulseWindow,
  seg,
  segInOut,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const QR = 164
const CARD_PAD = 16
const CARD_W = QR + CARD_PAD * 2
const CARD_H = CARD_W + 26
const BRACKET = 26
const BRACKET_GAP = 12

/**
 * A code friends can scan straight off this phone to find WitnessWork on Google
 * Play, framed like a camera's viewfinder.
 */
const AndroidShareVisual = ({ active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1100,
    loopMs: 3600,
    restAt: 0,
  })

  const cardStyle = useAnimatedStyle(() => {
    const p = seg(intro.value, 0, 0.7)
    const float = reduceMotion ? 0 : Math.sin(loop.value * Math.PI * 2) * 3
    return {
      opacity: Math.min(1, p * 2),
      transform: [
        { perspective: 800 },
        { translateY: float },
        { rotateY: `${(1 - backOut(p)) * 60}deg` },
        { scale: 0.8 + 0.2 * backOut(p) },
      ],
    }
  })
  const bracketsIn = useDerivedValue(() => seg(intro.value, 0.5, 1))
  const beamStyle = useAnimatedStyle(() => ({
    opacity: pulseWindow(loop.value, 0.08, 0.14, 0.56, 0.62) * bracketsIn.value,
    transform: [{ translateY: segInOut(loop.value, 0.1, 0.6) * (QR - 4) }],
  }))

  return (
    <View
      style={{
        width: VISUAL.width,
        height: VISUAL.height,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {CORNERS.map((corner, i) => (
        <Corner
          key={i}
          corner={corner}
          index={i}
          appear={bracketsIn}
          loop={loop}
          color={theme.colors.accent}
          reduceMotion={reduceMotion}
        />
      ))}
      <Animated.View
        style={[
          {
            width: CARD_W,
            height: CARD_H,
            borderRadius: 24,
            borderCurve: 'continuous',
            backgroundColor: '#FFFFFF',
            padding: CARD_PAD,
            alignItems: 'center',
            gap: 8,
            shadowColor: theme.colors.accent,
            shadowOpacity: 0.35,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
          },
          cardStyle,
        ]}
      >
        <StoreQrCode
          url={links.playStore}
          size={QR}
          accessibilityLabel={i18n.t('shareApp_qrAndroid')}
        />
        <VisualText
          style={{
            fontSize: 13,
            fontFamily: theme.fonts.bold,
            color: '#0B1410',
          }}
        >
          {i18n.t('shareApp_googlePlay')}
        </VisualText>
        <Animated.View
          pointerEvents='none'
          style={[
            {
              position: 'absolute',
              top: CARD_PAD,
              left: CARD_PAD - 6,
              right: CARD_PAD - 6,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.accent,
              shadowColor: theme.colors.accent,
              shadowOpacity: 0.9,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
            },
            beamStyle,
          ]}
        />
      </Animated.View>
    </View>
  )
}

const CORNERS = [
  { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
] as const

/** One corner of the viewfinder, settling in and breathing with the loop. */
const Corner = ({
  corner,
  index,
  appear,
  loop,
  color,
  reduceMotion,
}: {
  corner: (typeof CORNERS)[number]
  index: number
  appear: DerivedValue<number>
  loop: DerivedValue<number>
  color: string
  reduceMotion: boolean
}) => {
  const style = useAnimatedStyle(() => {
    const p = seg(appear.value, index * 0.1, 0.6 + index * 0.1)
    const breathe = reduceMotion ? 0 : Math.sin(loop.value * Math.PI * 2) * 2
    return {
      opacity: p,
      transform: [{ scale: (1.25 - 0.25 * backOut(p)) * (1 + breathe / 120) }],
    }
  })
  return (
    <Animated.View
      pointerEvents='none'
      style={[
        {
          position: 'absolute',
          width: CARD_W + BRACKET_GAP * 2,
          height: CARD_H + BRACKET_GAP * 2,
        },
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          width: BRACKET,
          height: BRACKET,
          borderColor: color,
          borderRadius: 6,
          ...corner,
        }}
      />
    </Animated.View>
  )
}

export default AndroidShareVisual
