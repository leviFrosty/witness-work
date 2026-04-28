import React, { PropsWithChildren } from 'react'
import {
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleSheet,
} from 'react-native'
import Haptics from '../lib/haptics'
import { GlassColorScheme, GlassView } from 'expo-glass-effect'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '../contexts/theme'

export interface ButtonProps extends PressableProps {
  onPress?: (event: GestureResponderEvent) => void
  onLongPress?: (event: GestureResponderEvent) => void
  disabled?: boolean
  noTransform?: boolean
  /**
   * Visual treatment of the button surface.
   *
   * - `solid` — flat card-color background (legacy default).
   * - `outline` — bordered, transparent background.
   * - `glass` — iOS 26 Liquid Glass material via `expo-glass-effect`. The
   *   caller's `style.backgroundColor` (or `glassTint`) acts as the visible
   *   fallback on iOS < 26 / Android — `GlassView` renders nothing there. See
   *   `AGENTS.md` ("primary CTAs" are an explicit glass-target surface).
   */
  variant?: 'solid' | 'outline' | 'glass'
  /**
   * Tint for the glass material (`variant='glass'` only). Doubles as the
   * fallback background on systems without Liquid Glass when the caller doesn't
   * set `style.backgroundColor` themselves.
   */
  glassTint?: string
  /** Glass appearance scheme override (`variant='glass'` only). */
  glassColorScheme?: GlassColorScheme
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

const Button: React.FC<PropsWithChildren<ButtonProps>> = ({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  noTransform,
  variant,
  glassTint,
  glassColorScheme,
  ...props
}) => {
  const translateY = useSharedValue(0)
  const opacity = useSharedValue(1)
  const theme = useTheme()
  const isGlass = variant === 'glass'

  const _onPress = (event: GestureResponderEvent) => {
    Haptics.light()
    onPress?.(event)
  }

  const _onLongPress = (event: GestureResponderEvent) => {
    Haptics.medium()
    onLongPress?.(event)
  }

  const onPressIn = () => {
    opacity.value = 0.7
    if (noTransform) {
      return
    }
    translateY.value = withTiming(1, {
      duration: 10,
      easing: Easing.in(Easing.quad),
    })
  }

  const onPressOut = () => {
    opacity.value = 1
    if (noTransform) {
      return
    }
    translateY.value = withTiming(0, {
      duration: 20,
      easing: Easing.in(Easing.quad),
    })
  }

  const styled = !!variant

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  return (
    <AnimatedPressable
      hitSlop={10}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress ? _onPress : undefined}
      onLongPress={onLongPress ? _onLongPress : undefined}
      style={[
        [
          {
            borderWidth: variant === 'outline' ? 1 : undefined,
            borderColor: styled ? theme.colors.border : undefined,
            borderRadius: styled ? theme.numbers.borderRadiusMd : undefined,
            paddingHorizontal: styled ? 15 : undefined,
            paddingVertical: styled ? 20 : undefined,
            flexDirection: styled ? 'row' : undefined,
            alignItems: styled ? 'center' : undefined,
            backgroundColor:
              variant === 'solid'
                ? theme.colors.card
                : isGlass
                  ? glassTint
                  : undefined,
            // Glass material is layered absolutely inside; clip it to the
            // button's borderRadius so the rounded shape carries through.
            overflow: isGlass ? 'hidden' : undefined,
          },
          animatedStyle,
        ],
        [style],
      ]}
      {...props}
    >
      {isGlass && (
        <GlassView
          pointerEvents='none'
          glassEffectStyle='regular'
          tintColor={glassTint}
          isInteractive
          colorScheme={glassColorScheme}
          style={StyleSheet.absoluteFill}
        />
      )}
      {children}
    </AnimatedPressable>
  )
}

export default Button
