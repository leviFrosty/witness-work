import { StyleSheet, View } from 'react-native'
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { Check as CheckIcon, Square as SquareIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'
import i18n from '@/lib/locales'
import {
  FINGER_FROM,
  FINGER_SIZE,
  STAGE,
  T,
  TAP_POINT,
  TILE,
} from '@/features/onboarding/constants/badgesPreview'
import {
  TapRipple,
  VisualText,
  backOut,
} from '@/features/updates/components/reveal/visuals/kit'
import {
  ease,
  span,
} from '@/features/onboarding/components/badges-preview/motion'

/**
 * A small "Shared the Good News" checkbox, like the one on Home, that a
 * fingertip taps: the box fills with a check, then the tile steps back for the
 * badge it earned.
 */
const SharedCheckTile = ({ t }: { t: SharedValue<number> }) => {
  const theme = useTheme()

  const tileStyle = useAnimatedStyle(() => {
    const shown = ease(t.value, T.tileIn) * (1 - span(t.value, T.tileOut))
    const away = ease(t.value, T.tileOut)
    const press = pressDip(t.value)
    return {
      opacity: shown,
      transform: [
        { translateY: (1 - ease(t.value, T.tileIn)) * 12 - away * 10 },
        { scale: (1 - press * 0.04) * (1 - away * 0.12) },
      ],
    }
  })
  const checkedStyle = useAnimatedStyle(() => {
    const p = span(t.value, T.check)
    return {
      opacity: Math.min(1, p * 3),
      transform: [{ scale: 0.5 + 0.5 * backOut(p) }],
    }
  })
  const fingerStyle = useAnimatedStyle(() => {
    const arrive = ease(t.value, T.fingerIn)
    const leave = ease(t.value, T.fingerOut)
    return {
      opacity: Math.min(1, span(t.value, T.fingerIn) * 2.5) * (1 - leave),
      transform: [
        { translateX: FINGER_FROM.x * (1 - arrive) + leave * 12 },
        { translateY: FINGER_FROM.y * (1 - arrive) + leave * 16 },
        { scale: 1 - pressDip(t.value) * 0.16 },
      ],
    }
  })
  const tap = useDerivedValue(() => span(t.value, T.ripple))

  return (
    <>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: (STAGE.width - TILE.width) / 2,
            top: (STAGE.height - TILE.height) / 2,
            width: TILE.width,
            height: TILE.height,
            paddingTop: TILE.padTop,
            paddingHorizontal: 10,
            alignItems: 'center',
            gap: 10,
            borderRadius: 18,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.1,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            // No Android elevation: it would lift the tile over the fingertip
            // and the card that replaces it.
          },
          tileStyle,
        ]}
      >
        <View style={{ width: TILE.check, height: TILE.check }}>
          <View
            style={[
              styles.checkCircle,
              { backgroundColor: theme.colors.accentTranslucent },
            ]}
          >
            <LucideIcon
              icon={SquareIcon}
              size={26}
              color={theme.colors.accent}
            />
          </View>
          <Animated.View
            style={[
              styles.checkCircle,
              { backgroundColor: theme.colors.accent },
              checkedStyle,
            ]}
          >
            <LucideIcon
              icon={CheckIcon}
              size={28}
              strokeWidth={3}
              color={theme.colors.textInverse}
            />
          </Animated.View>
        </View>
        <VisualText
          numberOfLines={2}
          style={{
            fontSize: 13,
            lineHeight: 17,
            textAlign: 'center',
            color: theme.colors.text,
          }}
        >
          {i18n.t('sharedTheGoodNews')}
        </VisualText>
      </Animated.View>

      <TapRipple
        tap={tap}
        color={theme.colors.accent}
        size={56}
        style={{ left: TAP_POINT.x - 28, top: TAP_POINT.y - 28 }}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: TAP_POINT.x - FINGER_SIZE / 2,
            top: TAP_POINT.y - FINGER_SIZE / 2,
            width: FINGER_SIZE,
            height: FINGER_SIZE,
            borderRadius: FINGER_SIZE / 2,
            borderWidth: 1.5,
            borderColor: withAlpha(theme.colors.text, 0x55),
            backgroundColor: withAlpha(theme.colors.text, 0x2a),
          },
          fingerStyle,
        ]}
      />
    </>
  )
}

/** 0→1→0 as the fingertip presses down and lifts. */
const pressDip = (t: number) => {
  'worklet'
  const [down, held, up] = T.press
  return span(t, [down, held]) * (1 - span(t, [held, up]))
}

const styles = StyleSheet.create({
  checkCircle: {
    ...StyleSheet.absoluteFill,
    borderRadius: TILE.check / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default SharedCheckTile
