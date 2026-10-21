import { I18nManager } from 'react-native'

/**
 * Reading-direction helpers for layout code. The direction is fixed for each JS
 * load (ADR 0026), so these can be read during render.
 *
 * React Native mirrors margins, paddings, `left`/`right` and `row` by itself.
 * These cover what it doesn't: gestures, translations, scroll offsets and
 * hand-placed drawing.
 */

/** Whether the app is laid out right to left. */
export function isRtlLayout(): boolean {
  return I18nManager?.isRTL === true
}

/**
 * +1 when "forward" (later, next, the trailing side) is toward +x, -1 in RTL.
 * Multiply a horizontal translation, drag distance or velocity by it to turn a
 * physical value into a reading-order one, or back.
 */
export function forwardSign(): 1 | -1 {
  return isRtlLayout() ? -1 : 1
}

/**
 * Horizontal `ScrollView`/`FlatList` offsets (`contentOffset.x`, `scrollTo({ x
 * })`) are physical on both platforms: in RTL the list starts scrolled to its
 * far right, at the largest offset. Converts between that and the distance
 * scrolled from the reading start; the conversion is its own inverse. A
 * worklet, so pass `rtl` (`isRtlLayout()`, read on the JS thread).
 */
export function flowScrollX(
  x: number,
  contentWidth: number,
  viewportWidth: number,
  rtl: boolean
): number {
  'worklet'
  if (!rtl) return x
  return Math.max(0, contentWidth - viewportWidth - x)
}

/** A side in reading order: start is left in LTR and right in RTL. */
export type FlowAlign = 'start' | 'end'

/**
 * `textAlign` for a `Text` that should hug the reading start or end. React
 * Native has no `start`/`end` here, but it swaps `left` and `right` for text
 * under RTL on both platforms, so `left` already means start.
 */
export function alignText(align: FlowAlign): 'left' | 'right' {
  return align === 'start' ? 'left' : 'right'
}

/**
 * `textAlign` for a `TextInput`. Unlike text, inputs take `left` and `right` as
 * physical sides on both platforms (iOS sets the field's alignment directly;
 * Android's `EditText` uses absolute gravity), so they're swapped here under
 * RTL.
 */
export function alignInput(align: FlowAlign): 'left' | 'right' {
  const start = isRtlLayout() ? 'right' : 'left'
  const end = start === 'left' ? 'right' : 'left'
  return align === 'start' ? start : end
}

/**
 * The `left` that puts a box at physical `x` (from `measureInWindow`, a touch,
 * or other screen coordinates) inside a container `containerWidth` wide. React
 * Native reads `left` as the distance from the right edge under RTL, so a
 * measured position needs mirroring before it's used as one.
 */
export function leftForPhysicalX(
  x: number,
  width: number,
  containerWidth: number
): number {
  return isRtlLayout() ? containerWidth - x - width : x
}

/** Opens a left-to-right isolate (LRI); {@link POP_ISOLATE} closes it. */
export const LTR_ISOLATE = '⁦'

/** Closes a directional isolate (PDI). */
export const POP_ISOLATE = '⁩'

/**
 * Keeps Latin-only data (a phone number, email or URL) in its own left-to-right
 * order inside a right-to-left paragraph, where "+1 415 555" would otherwise
 * read "555 415 1+". Wraps it in Unicode isolates (LRI…PDI), so use it for
 * display only, never for stored or copied values. Text split across styled
 * spans puts {@link LTR_ISOLATE} before the first and {@link POP_ISOLATE} after
 * the last.
 */
export function ltrIsolate(text: string): string {
  return `${LTR_ISOLATE}${text}${POP_ISOLATE}`
}
