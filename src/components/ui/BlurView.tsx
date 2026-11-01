import { BlurView as ExpoBlurView, type BlurViewProps } from 'expo-blur'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import getThemeFromColorScheme from '@/constants/theme'
import useReduceTransparencyEnabled from '@/hooks/useReduceTransparencyEnabled'

interface Props extends BlurViewProps {
  reducedTransparencyColor?: string
}

export function BlurView({
  reducedTransparencyColor,
  tint,
  style,
  pointerEvents,
  children,
  ...props
}: Props) {
  const theme = useTheme()
  const reduceTransparency = useReduceTransparencyEnabled()

  if (reduceTransparency) {
    const tintScheme = tint?.match(/dark/i)
      ? 'dark'
      : tint?.match(/light/i)
        ? 'light'
        : undefined
    const color =
      reducedTransparencyColor ??
      (tintScheme
        ? getThemeFromColorScheme(tintScheme).colors.card
        : theme.colors.card)
    return (
      <View
        pointerEvents={pointerEvents}
        style={[style, { backgroundColor: color }]}
      >
        {children}
      </View>
    )
  }

  return (
    <ExpoBlurView
      tint={tint}
      style={style}
      pointerEvents={pointerEvents}
      {...props}
    >
      {children}
    </ExpoBlurView>
  )
}
