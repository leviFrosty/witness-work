import { Platform, type ViewStyle } from 'react-native'

export const MIN_TOUCH_TARGET = Platform.OS === 'android' ? 48 : 44

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
