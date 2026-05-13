import React, { PropsWithChildren } from 'react'
import {
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleSheet,
  ViewStyle,
} from 'react-native'
import Haptics from '@/lib/haptics'
import { GlassColorScheme, GlassView } from 'expo-glass-effect'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'

export interface ButtonProps extends PressableProps {
  onPress?: (event: GestureResponderEvent) => void
  onLongPress?: (event: GestureResponderEvent) => void
  disabled?: boolean
  /**
   * Skips the press-down translate AND opts this button out of Reanimated
   * entirely. Visually equivalent: press-dim still happens, but via Pressable's
   * native `pressed` state instead of a `useSharedValue` / `useAnimatedStyle`
   * pair.
   *
   * ## When you MUST set this
   *
   * Set `noTransform` whenever the Button (or any ancestor up to its nearest
   * stable parent) lives inside a component that **mounts and unmounts via a
   * portal in response to user interaction**. The known offenders, all from
   * Tamagui, are:
   *
   * - `<Popover.Trigger asChild>{button}</Popover.Trigger>`
   * - `<Tooltip.Trigger asChild>{button}</Tooltip.Trigger>`
   * - `<Dialog.Trigger asChild>{button}</Dialog.Trigger>`
   * - `<Sheet>` content that toggles open/closed and contains Buttons
   * - Any other `*.Trigger asChild` pattern that wraps a Button child
   *
   * ## Why — the actual failure mode
   *
   * On Reanimated 4 + the New Architecture (Fabric), a Button that registers
   * shared values can crash the app with `EXC_BAD_ACCESS` after a few
   * open/close cycles of its portal-using parent. The native crash trace looks
   * like:
   *
   *     0 folly::dynamic::type() const                  [SIGSEGV]
   *     1 folly::dynamic::hash() const
   *     ...
   *
   * 13 folly::dynamic::dynamic(folly::dynamic const&) 14
   * facebook::react::ShadowNode::clone(...) ... 28
   * reanimated::ReanimatedModuleProxy::commitUpdates(...) ... 98
   * worklets::AnimationFrameBatchinator::flush()::$_0
   *
   * What's happening: Reanimated's UI worklet has a queued frame that
   * dispatches `setNativeProps` to a ShadowNode whose `folly::dynamic` props
   * have already been freed by an unmount. Cloning the (dead) node during the
   * next layout pass reads garbage memory and segfaults. It's a use-after-free
   * between the JS-thread's render commit and the UI-thread's worklet flush.
   *
   * Setting `noTransform` makes the Button render a plain `<Pressable>` with no
   * shared values and no animated style, so it never registers with
   * Reanimated's animated-views set, so it can't be the dangling target of a
   * later worklet flush.
   *
   * ## Why TypeScript can't enforce this
   *
   * JSX type-checks each element in isolation: when `<Button />` is checked,
   * the compiler has no visibility into who its parent is. There's no mechanism
   * to say "if this is a child of `Popover.Trigger`, then `noTransform` must be
   * `true`." We'd need either:
   *
   * - A custom ESLint rule that walks the JSX AST (lint, not TS), or
   * - Module-augmenting Tamagui's `*.Trigger` to constrain `children` to a
   *   branded `ReactElement` — but Tamagui's `asChild` uses
   *   `React.cloneElement`, which erases that brand at runtime, and the
   *   generated Tamagui types are too elaborate to safely override.
   *
   * Neither pulls its weight for the handful of trigger sites we have. If you
   * add a new Popover/Tooltip/Dialog/Sheet trigger, **set `noTransform` by
   * hand** and reference this comment in code review.
   */
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

const useButtonBaseStyle = (
  variant: ButtonProps['variant'],
  glassTint: string | undefined
): { baseStyle: ViewStyle; isGlass: boolean } => {
  const theme = useTheme()
  const isGlass = variant === 'glass'
  const styled = !!variant
  return {
    baseStyle: {
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
    isGlass,
  }
}

const PlainButton: React.FC<PropsWithChildren<ButtonProps>> = ({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  variant,
  glassTint,
  glassColorScheme,
  ...props
}) => {
  const { baseStyle, isGlass } = useButtonBaseStyle(variant, glassTint)
  const glassBorderRadius = isGlass
    ? StyleSheet.flatten([baseStyle, style as ViewStyle]).borderRadius
    : undefined

  const _onPress = (event: GestureResponderEvent) => {
    Haptics.light()
    onPress?.(event)
  }

  const _onLongPress = (event: GestureResponderEvent) => {
    Haptics.medium()
    onLongPress?.(event)
  }

  return (
    <Pressable
      hitSlop={10}
      disabled={disabled}
      onPress={onPress ? _onPress : undefined}
      onLongPress={onLongPress ? _onLongPress : undefined}
      style={({ pressed }) => [
        baseStyle,
        { opacity: pressed ? 0.7 : 1 },
        style as ViewStyle,
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
          style={[StyleSheet.absoluteFill, { borderRadius: glassBorderRadius }]}
        />
      )}
      {children}
    </Pressable>
  )
}

const AnimatedButton: React.FC<PropsWithChildren<ButtonProps>> = ({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  variant,
  glassTint,
  glassColorScheme,
  ...props
}) => {
  const translateY = useSharedValue(0)
  const opacity = useSharedValue(1)
  const { baseStyle, isGlass } = useButtonBaseStyle(variant, glassTint)
  const glassBorderRadius = isGlass
    ? StyleSheet.flatten([baseStyle, style as ViewStyle]).borderRadius
    : undefined

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
    translateY.value = withTiming(1, {
      duration: 10,
      easing: Easing.in(Easing.quad),
    })
  }

  const onPressOut = () => {
    opacity.value = 1
    translateY.value = withTiming(0, {
      duration: 20,
      easing: Easing.in(Easing.quad),
    })
  }

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
      style={[[baseStyle, animatedStyle], [style]]}
      {...props}
    >
      {isGlass && (
        <GlassView
          pointerEvents='none'
          glassEffectStyle='regular'
          tintColor={glassTint}
          isInteractive
          colorScheme={glassColorScheme}
          style={[StyleSheet.absoluteFill, { borderRadius: glassBorderRadius }]}
        />
      )}
      {children}
    </AnimatedPressable>
  )
}

const Button: React.FC<PropsWithChildren<ButtonProps>> = (props) => {
  if (props.noTransform) {
    return <PlainButton {...props} />
  }
  return <AnimatedButton {...props} />
}

export default Button
