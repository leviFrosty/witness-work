import { Platform, type ViewStyle } from 'react-native'

export const MIN_TOUCH_TARGET = Platform.select({ android: 48, default: 44 })

export const touchTargetFrame = (width: number, height = width): ViewStyle => {
  const inset = (side: number) => Math.min(0, side - MIN_TOUCH_TARGET) / 2
  return {
    width: Math.max(width, MIN_TOUCH_TARGET),
    height: Math.max(height, MIN_TOUCH_TARGET),
    marginHorizontal: inset(width),
    marginVertical: inset(height),
    alignItems: 'center',
    justifyContent: 'center',
  }
}

export const webTextTargetFrame = (
  side: 'start' | 'end' = 'start'
): ViewStyle =>
  Platform.OS === 'web'
    ? {
        minWidth: MIN_TOUCH_TARGET,
        minHeight: MIN_TOUCH_TARGET,
        paddingHorizontal: 10,
        ...(side === 'end' ? { marginRight: -10 } : { marginLeft: -10 }),
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
      }
    : {}

export const webRowTargetFrame = (height: number): ViewStyle =>
  Platform.OS === 'web' && height < MIN_TOUCH_TARGET
    ? {
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: 'center',
        marginVertical: (height - MIN_TOUCH_TARGET) / 2,
      }
    : {}
