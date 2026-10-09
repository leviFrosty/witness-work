import React, {
  isValidElement,
  PropsWithChildren,
  ReactElement,
  ReactNode,
  useState,
} from 'react'
import {
  ActivityIndicator,
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  PressableProps,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native'
import Haptics from '@/lib/haptics'
import {
  GlassColorScheme,
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import useGlassColorScheme from '@/hooks/useGlassColorScheme'
import PointerHover, {
  HoverTint,
  type PointerEffect,
} from '@/components/ui/PointerHover'
import { supportsPointerEffects } from '@/lib/pointerHover'

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
   *   caller's `style.backgroundColor`, `glassTint`, or the theme's card color
   *   provides the fallback on iOS < 26 / Android. See `AGENTS.md` ("primary
   *   CTAs" are an explicit glass-target surface).
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
  /**
   * IPad pointer feedback. `auto` follows Apple's guidance: small clear
   * controls highlight, small opaque ones lift, and large surfaces get a tint
   * without scaling into their neighbours. Use `none` when a parent already
   * owns the hover (e.g. a row that tints as a whole).
   */
  pointerEffect?: PointerEffect | 'tint' | 'auto'
  /**
   * Work this button started is running: a spinner covers the content, which
   * stays laid out (invisible) so the width doesn't change. The button can't be
   * pressed and reads as busy to screen readers.
   */
  loading?: boolean
  /** Spinner color while `loading`; match the label. Defaults to `textAlt`. */
  loadingColor?: string
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// Bigger than a control: scaling it would crowd what's around it.
const LARGE_WIDTH = 200
const LARGE_HEIGHT = 72

const isOpaque = (color: unknown) =>
  typeof color === 'string' &&
  color !== 'transparent' &&
  !/^rgba|^hsla/.test(color) &&
  !/^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(color)

const LAYOUT_KEYS = [
  'flexDirection',
  'alignItems',
  'justifyContent',
  'flexWrap',
  'gap',
  'rowGap',
  'columnGap',
] as const

/**
 * While loading, the children sit invisible in a box laid out like the button,
 * so its size holds, and a spinner covers them. The children stay in the
 * accessibility tree, so the button keeps its label.
 */
const LoadingContent: React.FC<
  PropsWithChildren<{ surfaceStyle: ViewStyle; color: string | undefined }>
> = ({ surfaceStyle, color, children }) => {
  const theme = useTheme()
  const layout: ViewStyle = {}
  for (const key of LAYOUT_KEYS) {
    if (surfaceStyle[key] !== undefined)
      (layout as Record<string, unknown>)[key] = surfaceStyle[key]
  }
  return (
    <>
      <View style={[layout, { flexShrink: 1, opacity: 0 }]}>{children}</View>
      <View
        pointerEvents='none'
        accessibilityElementsHidden
        importantForAccessibility='no-hide-descendants'
        style={[
          StyleSheet.absoluteFill,
          { alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <ActivityIndicator size='small' color={color ?? theme.colors.textAlt} />
      </View>
    </>
  )
}

/** The text inside `node`, for a label once the children are hidden. */
const textContent = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node))
    return node.map(textContent).filter(Boolean).join(' ')
  if (isValidElement(node))
    return textContent((node.props as { children?: ReactNode }).children)
  return ''
}

/**
 * Android leaves the invisible children out of the button's description, so a
 * loading button names itself from their text.
 */
const loadingLabel = (
  loading: boolean | undefined,
  label: string | undefined,
  children: ReactNode
) => label ?? (loading ? textContent(children) || undefined : undefined)

const busyState = (
  loading: boolean | undefined,
  state: ButtonProps['accessibilityState']
): ButtonProps['accessibilityState'] =>
  loading ? { ...state, busy: true } : state

/**
 * Picks the pointer treatment from the rendered size and fill. Returns a
 * wrapper for the pressable, the tint overlay to render inside it, and a layout
 * listener that measures it.
 */
const useButtonPointer = (
  pointerEffect: ButtonProps['pointerEffect'],
  surfaceStyle: ViewStyle,
  onLayoutProp: ButtonProps['onLayout'],
  disabled: boolean | null | undefined
) => {
  const [large, setLarge] = useState(false)
  const [hovered, setHovered] = useState(false)
  const requested = pointerEffect ?? 'auto'
  if (!supportsPointerEffects || requested === 'none' || disabled) {
    return {
      wrap: (pressable: ReactElement) => pressable,
      overlay: null,
      onLayout: onLayoutProp,
    }
  }
  const effect =
    requested !== 'auto'
      ? requested
      : large
        ? 'tint'
        : isOpaque(surfaceStyle.backgroundColor)
          ? 'lift'
          : 'highlight'
  return {
    wrap: (pressable: ReactElement) => (
      <PointerHover
        effect={effect === 'tint' ? 'none' : effect}
        onHoverChange={effect === 'tint' ? setHovered : undefined}
      >
        {pressable}
      </PointerHover>
    ),
    overlay: (
      <HoverTint
        visible={effect === 'tint' && hovered}
        borderRadius={surfaceStyle.borderRadius}
        borderCurve={surfaceStyle.borderCurve}
      />
    ),
    onLayout: (event: LayoutChangeEvent) => {
      onLayoutProp?.(event)
      const { width, height } = event.nativeEvent.layout
      setLarge(width > LARGE_WIDTH || height > LARGE_HEIGHT)
    },
  }
}

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
            ? (glassTint ??
              (isLiquidGlassAvailable() ? undefined : theme.colors.card))
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
  pointerEffect,
  onLayout,
  loading,
  loadingColor,
  accessibilityState,
  accessibilityLabel,
  ...props
}) => {
  const { baseStyle, isGlass } = useButtonBaseStyle(variant, glassTint)
  const resolvedGlassColorScheme = useGlassColorScheme()
  const surfaceStyle = StyleSheet.flatten([
    baseStyle,
    (typeof style === 'function'
      ? style({ pressed: false })
      : style) as ViewStyle,
  ])
  const glassBorderRadius = isGlass ? surfaceStyle.borderRadius : undefined
  const pointer = useButtonPointer(
    pointerEffect,
    surfaceStyle,
    onLayout,
    disabled || loading
  )

  const _onPress = (event: GestureResponderEvent) => {
    Haptics.light()
    onPress?.(event)
  }

  const _onLongPress = (event: GestureResponderEvent) => {
    Haptics.medium()
    onLongPress?.(event)
  }

  return pointer.wrap(
    <Pressable
      hitSlop={10}
      disabled={disabled || loading}
      accessibilityState={busyState(loading, accessibilityState)}
      accessibilityLabel={loadingLabel(loading, accessibilityLabel, children)}
      onPress={onPress ? _onPress : undefined}
      onLongPress={onLongPress ? _onLongPress : undefined}
      onLayout={pointer.onLayout}
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
          colorScheme={glassColorScheme ?? resolvedGlassColorScheme}
          style={[StyleSheet.absoluteFill, { borderRadius: glassBorderRadius }]}
        />
      )}
      {loading ? (
        <LoadingContent surfaceStyle={surfaceStyle} color={loadingColor}>
          {children}
        </LoadingContent>
      ) : (
        children
      )}
      {pointer.overlay}
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
  pointerEffect,
  onLayout,
  loading,
  loadingColor,
  accessibilityState,
  accessibilityLabel,
  ...props
}) => {
  const translateY = useSharedValue(0)
  const opacity = useSharedValue(1)
  const { baseStyle, isGlass } = useButtonBaseStyle(variant, glassTint)
  const resolvedGlassColorScheme = useGlassColorScheme()
  const surfaceStyle = StyleSheet.flatten([baseStyle, style as ViewStyle])
  const glassBorderRadius = isGlass ? surfaceStyle.borderRadius : undefined
  const pointer = useButtonPointer(
    pointerEffect,
    surfaceStyle,
    onLayout,
    disabled || loading
  )

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

  return pointer.wrap(
    <AnimatedPressable
      hitSlop={10}
      disabled={disabled || loading}
      accessibilityState={busyState(loading, accessibilityState)}
      accessibilityLabel={loadingLabel(loading, accessibilityLabel, children)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress ? _onPress : undefined}
      onLongPress={onLongPress ? _onLongPress : undefined}
      onLayout={pointer.onLayout}
      style={[[baseStyle, animatedStyle], [style]]}
      {...props}
    >
      {isGlass && (
        <GlassView
          pointerEvents='none'
          glassEffectStyle='regular'
          tintColor={glassTint}
          isInteractive
          colorScheme={glassColorScheme ?? resolvedGlassColorScheme}
          style={[StyleSheet.absoluteFill, { borderRadius: glassBorderRadius }]}
        />
      )}
      {loading ? (
        <LoadingContent surfaceStyle={surfaceStyle} color={loadingColor}>
          {children}
        </LoadingContent>
      ) : (
        children
      )}
      {pointer.overlay}
    </AnimatedPressable>
  )
}

/**
 * A Button with nothing to do: same surface, but a plain View, so it doesn't
 * dim, shift, take the touch, or read as tappable. Covers containers styled
 * like buttons (e.g. empty-state blocks) and triggers whose press is handled
 * natively by a wrapper (e.g. a `MenuView`).
 */
const InertButton: React.FC<PropsWithChildren<ButtonProps>> = ({
  children,
  style,
  variant,
  glassTint,
  glassColorScheme,
  noTransform: _noTransform,
  hitSlop: _hitSlop,
  pointerEffect: _pointerEffect,
  loading: _loading,
  loadingColor: _loadingColor,
  ...props
}) => {
  const { baseStyle, isGlass } = useButtonBaseStyle(variant, glassTint)
  const resolvedGlassColorScheme = useGlassColorScheme()
  const resolvedStyle =
    typeof style === 'function' ? style({ pressed: false }) : style
  const glassBorderRadius = isGlass
    ? StyleSheet.flatten([baseStyle, resolvedStyle as ViewStyle]).borderRadius
    : undefined

  return (
    <View
      // Labelled triggers (e.g. a MenuView's button) stay one accessible
      // element; plain containers let their content be read as-is.
      accessible={
        props.accessibilityLabel != null || props.accessibilityRole != null
      }
      {...props}
      style={[baseStyle, resolvedStyle as ViewStyle]}
    >
      {isGlass && (
        <GlassView
          pointerEvents='none'
          glassEffectStyle='regular'
          tintColor={glassTint}
          colorScheme={glassColorScheme ?? resolvedGlassColorScheme}
          style={[StyleSheet.absoluteFill, { borderRadius: glassBorderRadius }]}
        />
      )}
      {children}
    </View>
  )
}

const Button: React.FC<PropsWithChildren<ButtonProps>> = (props) => {
  if (
    !props.onPress &&
    !props.onLongPress &&
    !props.onPressIn &&
    !props.onPressOut
  ) {
    return <InertButton {...props} />
  }
  if (props.noTransform) {
    return <PlainButton {...props} />
  }
  return <AnimatedButton {...props} />
}

export default Button
