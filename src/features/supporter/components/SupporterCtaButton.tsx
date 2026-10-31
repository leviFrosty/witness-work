import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { LayoutChangeEvent, Platform, View, ViewStyle } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import {
  Canvas,
  RoundedRect,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia'
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated'
import Button, { ButtonProps } from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import useAppActive from '@/hooks/useAppActive'
import useOnScreen from '@/hooks/useOnScreen'

interface Props extends ButtonProps {
  onPress: () => unknown
  disabled?: boolean
  /**
   * Render the animated supporter-gold rim. Reserved for the recurring
   * Supporter tier — one-time tips fall back to a flat ActionButton-style
   * fill.
   */
  shimmer?: boolean
}

const BORDER_RADIUS = 14
const STROKE_WIDTH = 2.5
// Half the stroke sits outside the button edge — give the canvas enough
// breathing room so it isn't clipped.
const CANVAS_INSET = STROKE_WIDTH
// Seconds per full rotation. Slow enough to feel ambient, not flashy.
const ROTATION_SECONDS = 14

const buttonStyle = (
  disabled: boolean | undefined,
  accent: string,
  accentAlt: string
) => ({
  backgroundColor: disabled ? accentAlt : accent,
  borderRadius: BORDER_RADIUS,
  paddingVertical: 16,
  paddingHorizontal: 24,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
})

const PlainCta: React.FC<PropsWithChildren<Omit<Props, 'shimmer'>>> = ({
  onPress,
  disabled,
  style,
  children,
  ...rest
}) => {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      disabled={disabled}
      style={[
        buttonStyle(disabled, theme.colors.accent, theme.colors.accentAlt),
        style as ViewStyle,
      ]}
      {...rest}
    >
      {children}
    </Button>
  )
}

const ShimmerCta: React.FC<PropsWithChildren<Omit<Props, 'shimmer'>>> = ({
  onPress,
  disabled,
  style,
  children,
  ...rest
}) => {
  const theme = useTheme()
  const rimRef = useRef<View>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const time = useSharedValue(0)

  // Only turn while someone can see the rim: a frame callback keeps redrawing
  // the canvas behind other screens, in the background on Android, and when
  // scrolled away, which pins a core on software-rendered GPUs.
  const focused = useIsFocused()
  const appActive = useAppActive()
  const visible = focused && appActive && !disabled && size !== null
  const onScreen = useOnScreen(rimRef, visible)
  const running = visible && onScreen

  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    'worklet'
    // Cap the step so the rim resumes where it paused instead of jumping.
    time.value += Math.min(timeSincePreviousFrame ?? 16, 64) / 1000
  }, false)

  useEffect(() => {
    frame.setActive(running)
    return () => frame.setActive(false)
  }, [running, frame])

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout
    setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
  }, [])

  const transform = useDerivedValue(() => [
    {
      rotate: ((time.value / ROTATION_SECONDS) * Math.PI * 2) % (Math.PI * 2),
    },
  ])

  const origin = useDerivedValue(() => {
    if (!size) return vec(0, 0)
    return vec(size.w / 2 + CANVAS_INSET, size.h / 2 + CANVAS_INSET)
  })

  // All stops sit on the supporter/gold band so the rim reads as a single
  // themed border with a soft highlight that slowly travels around it, not a
  // multi-coloured ring. Anchored on `supporter` at both ends so the sweep
  // loops seamlessly with no hard seam.
  const gradientColors = [
    theme.colors.supporter,
    theme.colors.warn,
    theme.colors.supporter,
    theme.colors.warnAlt,
    theme.colors.supporter,
  ]

  const rimFrame = size && {
    position: 'absolute' as const,
    left: -CANVAS_INSET,
    top: -CANVAS_INSET,
    width: size.w + CANVAS_INSET * 2,
    height: size.h + CANVAS_INSET * 2,
  }
  const rim = size && !disabled && (
    <Canvas
      pointerEvents='none'
      style={Platform.OS === 'web' ? { flex: 1 } : rimFrame}
    >
      <RoundedRect
        x={CANVAS_INSET}
        y={CANVAS_INSET}
        width={size.w}
        height={size.h}
        r={BORDER_RADIUS}
        style='stroke'
        strokeWidth={STROKE_WIDTH}
      >
        <SweepGradient
          c={origin}
          colors={gradientColors}
          origin={origin}
          transform={transform}
        />
      </RoundedRect>
    </Canvas>
  )

  return (
    <View ref={rimRef}>
      <View onLayout={handleLayout}>
        <Button
          onPress={onPress}
          disabled={disabled}
          style={[
            buttonStyle(
              disabled,
              theme.colors.supporter,
              theme.colors.supporterAlt
            ),
            style as ViewStyle,
          ]}
          {...rest}
        >
          {children}
        </Button>
      </View>
      {rim &&
        // Skia's web canvas ignores `pointerEvents`, so the rim would take
        // the button's clicks; a View passes them through.
        (Platform.OS === 'web' ? (
          <View pointerEvents='none' style={rimFrame}>
            {rim}
          </View>
        ) : (
          rim
        ))}
    </View>
  )
}

const SupporterCtaButton: React.FC<PropsWithChildren<Props>> = ({
  shimmer,
  ...props
}) => (shimmer ? <ShimmerCta {...props} /> : <PlainCta {...props} />)

export default SupporterCtaButton
