import { Platform, type ViewStyle } from 'react-native'

/** The smallest tap target: Apple's 44pt, and Material's 48dp on Android. */
export const MIN_TOUCH_TARGET = Platform.OS === 'android' ? 48 : 44

/**
 * A real minimum-size frame for a control that looks `width` × `height`, pulled
 * back with negative margin so the layout and the glyph don't move. Unlike
 * `hitSlop`, a frame isn't lost to a sibling or to a parent's drag.
 */
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
