import { PropsWithChildren, useContext } from 'react'
import { StyleSheet, View, ViewProps } from 'react-native'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import useTheme from '@/contexts/theme'
import useGlassColorScheme from '@/hooks/useGlassColorScheme'
import {
  MAP_IMAGERY_GLASS_TINT,
  MapImageryContext,
} from '@/features/map/lib/mapImageryTheme'

type Props = PropsWithChildren<
  Pick<ViewProps, 'onAccessibilityEscape'> & { fill?: boolean }
>

/**
 * Glass surface for cards floating over the map. It isn't pressable itself: its
 * content hosts a long-press `ContextMenu` next to inline buttons, and neither
 * may sit inside another touchable.
 */
export default function MapCard({
  children,
  fill = true,
  onAccessibilityEscape,
}: Props) {
  const theme = useTheme()
  const overImagery = useContext(MapImageryContext)
  const glassColorScheme = useGlassColorScheme()
  const tint = overImagery ? MAP_IMAGERY_GLASS_TINT : undefined
  const borderRadius = theme.numbers.borderRadiusLg

  return (
    <View
      onAccessibilityEscape={onAccessibilityEscape}
      style={{
        borderRadius,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor:
          tint ?? (isLiquidGlassAvailable() ? undefined : theme.colors.card),
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: 12,
        gap: 4,
        flex: fill ? 1 : undefined,
      }}
    >
      <GlassView
        pointerEvents='none'
        glassEffectStyle='regular'
        tintColor={tint}
        colorScheme={glassColorScheme}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      {children}
    </View>
  )
}
