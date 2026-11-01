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

  noTransform?: boolean

  variant?: 'solid' | 'outline' | 'glass'

  glassTint?: string

  glassColorScheme?: GlassColorScheme

  pointerEffect?: PointerEffect | 'tint' | 'auto'

  loading?: boolean

  loadingColor?: string
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

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

const textContent = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node))
    return node.map(textContent).filter(Boolean).join(' ')
  if (isValidElement(node))
    return textContent((node.props as { children?: ReactNode }).children)
  return ''
}

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
  accessibilityRole = 'button',
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
      accessibilityRole={accessibilityRole}
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
  accessibilityRole = 'button',
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
      accessibilityRole={accessibilityRole}
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
