import { BlurView as ExpoBlurView, type BlurViewProps } from 'expo-blur'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import getThemeFromColorScheme from '@/constants/theme'
import useReduceTransparencyEnabled from '@/hooks/useReduceTransparencyEnabled'

interface Props extends BlurViewProps {
  /**
   * The solid fill shown instead of the blur while Reduce Transparency is on.
   * Defaults to the card color of the tint's appearance.
   */
  reducedTransparencyColor?: string
}

/**
 * Expo-blur's `BlurView`, painted solid while iOS Reduce Transparency is on.
 * The system drops the blur but leaves the view clear, so whatever scrolls
 * behind a translucent header or bar shows through sharper than before.
 */
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
