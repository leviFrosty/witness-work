import { Platform } from 'react-native'
import { analytics } from '@/lib/analytics'

/**
 * IPadOS (including iPad apps on Mac) and Android report a hovering trackpad,
 * mouse, or Pencil. iPhone never does, so it skips the hover machinery.
 */
export const supportsPointerHover =
  Platform.OS === 'android' || (Platform.OS === 'ios' && Platform.isPad)

/** System pointer effects are UIKit-only. */
export const supportsPointerEffects = Platform.OS === 'ios' && Platform.isPad

let reported = false

/**
 * Sizes the pointer audience without per-hover events: once per launch here,
 * and the analytics frequency cap keeps it to daily reach.
 */
export function notePointerHover(input: 'pointer' | 'stylus') {
  if (reported) return
  reported = true
  analytics.capture('pointer_hover_detected', { input })
}
