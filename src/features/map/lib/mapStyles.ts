import { Platform, type ViewStyle } from 'react-native'
import { isLiquidGlassAvailable } from 'expo-glass-effect'

const liquidGlass = isLiquidGlassAvailable()

/** A chip or button over the map: 44pt on iOS, Material's 48dp on Android. */
export const MAP_BUTTON_HEIGHT = Platform.select({ android: 48, default: 44 })

/** The glass pill the Map's chips share. */
export const mapPillStyle = (cardColor: string): ViewStyle => ({
  height: MAP_BUTTON_HEIGHT,
  borderRadius: MAP_BUTTON_HEIGHT / 2,
  borderCurve: 'continuous',
  paddingHorizontal: 14,
  paddingVertical: 0,
  gap: 8,
  flexShrink: 1,
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: liquidGlass ? undefined : cardColor + 'dd',
})

/** A round, icon-only glass button over the map. */
export const mapControlStyle = (cardColor: string) => ({
  width: 44,
  height: 44,
  borderRadius: 22,
  borderCurve: 'continuous' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingHorizontal: 0,
  paddingVertical: 0,
  backgroundColor: liquidGlass ? undefined : cardColor + 'dd',
})

// Icon-only controls in the leading column; their labels open toward the map.
// `Button` already supplies the pointer effect.
export const MAP_CONTROL_TOOLTIP = {
  placement: 'right',
  effect: 'none',
  style: { borderRadius: 22 },
} as const

/** How overlays slide as the cards stow and come back. */
export const STOW_TRANSITION = {
  transitionDuration: 280,
  transitionTimingFunction: 'ease-in-out',
} as const
