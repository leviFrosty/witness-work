import { PropsWithChildren, useCallback, useState } from 'react'
import { LayoutChangeEvent, View, ViewStyle } from 'react-native'
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
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const time = useSharedValue(0)

  useFrameCallback((frame) => {
    'worklet'
    time.value = frame.timeSinceFirstFrame / 1000
  })

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

  return (
    <View>
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
      {size && !disabled && (
        <Canvas
          pointerEvents='none'
          style={{
            position: 'absolute',
            left: -CANVAS_INSET,
            top: -CANVAS_INSET,
            width: size.w + CANVAS_INSET * 2,
            height: size.h + CANVAS_INSET * 2,
          }}
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
      )}
    </View>
  )
}

const SupporterCtaButton: React.FC<PropsWithChildren<Props>> = ({
  shimmer,
  ...props
}) => (shimmer ? <ShimmerCta {...props} /> : <PlainCta {...props} />)

export default SupporterCtaButton
