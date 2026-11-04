import { Platform, type ViewStyle } from 'react-native'

/** The smallest tap target: Apple's 44pt, and Material's 48dp on Android. */
export const MIN_TOUCH_TARGET = Platform.select({ android: 48, default: 44 })

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

/**
 * A text-only button's real minimum-size frame, on the web only
 * (react-native-web ignores `hitSlop`, and a bare line of text is about 20
 * high). The text keeps to its `side` of the frame, so a button pinned to a
 * header's end stays where it was. Native keeps its own sizing and `hitSlop`.
 */
export const webTextTargetFrame = (
  side: 'start' | 'end' = 'start'
): ViewStyle =>
  Platform.OS === 'web'
    ? {
        minWidth: MIN_TOUCH_TARGET,
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: 'center',
        alignItems: side === 'end' ? 'flex-end' : 'flex-start',
      }
    : {}

/**
 * The same for a full-width row of `height` (a link line, like "View full
 * schedule"): the row grows to the minimum and its margin pulls the extra back,
 * so what's around it stays put. Web only; native has `hitSlop`.
 */
export const webRowTargetFrame = (height: number): ViewStyle =>
  Platform.OS === 'web' && height < MIN_TOUCH_TARGET
    ? {
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: 'center',
        marginVertical: (height - MIN_TOUCH_TARGET) / 2,
      }
    : {}
