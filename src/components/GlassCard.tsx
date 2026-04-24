import { PropsWithChildren } from 'react'
import { View, ViewProps, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import useTheme from '../contexts/theme'

type GlassCardVariant = 'surface' | 'elevated'
export type GlassCardTone = 'default' | 'amber'

interface Props extends ViewProps {
  variant?: GlassCardVariant
  padding?: number
  highlighted?: boolean
  /**
   * Semantic color treatment. `amber` is reserved for the month-goal
   * crushed/record celebration — tints the glass warm and swaps the border to
   * the supporter palette. Default keeps the neutral card look used everywhere
   * else.
   */
  tone?: GlassCardTone
}

const GlassCard: React.FC<PropsWithChildren<Props>> = ({
  children,
  variant = 'surface',
  padding = 20,
  highlighted,
  tone = 'default',
  style,
  ...props
}) => {
  const theme = useTheme()
  const radius = theme.numbers.borderRadiusLg
  const intensity = variant === 'elevated' ? 60 : 40
  const isAmber = tone === 'amber'

  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          shadowColor: isAmber ? theme.colors.supporter : theme.colors.shadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isAmber ? 0.25 : variant === 'elevated' ? 0.18 : 0.1,
          shadowRadius: variant === 'elevated' ? 14 : 8,
          // iOS squircle — smoother than circular corners.
          borderCurve: 'continuous',
        },
        style,
      ]}
      {...props}
    >
      <BlurView
        tint={theme.colors.background === '#121212' ? 'dark' : 'light'}
        intensity={intensity}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents='none'
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.colors.card,
            opacity: variant === 'elevated' ? 0.55 : 0.7,
          },
        ]}
      />
      {isAmber && (
        <View
          pointerEvents='none'
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.colors.supporterTranslucent },
          ]}
        />
      )}
      <View
        pointerEvents='none'
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            borderCurve: 'continuous',
            borderWidth: isAmber || highlighted ? 2 : StyleSheet.hairlineWidth,
            borderColor: isAmber
              ? theme.colors.supporter
              : highlighted
                ? theme.colors.accent
                : theme.colors.border,
          },
        ]}
      />
      <View style={{ padding }}>{children}</View>
    </View>
  )
}

export default GlassCard
