import { Platform } from 'react-native'
import { analytics } from '@/lib/analytics'

export const supportsPointerHover =
  Platform.OS === 'android' || (Platform.OS === 'ios' && Platform.isPad)

export const supportsPointerEffects = Platform.OS === 'ios' && Platform.isPad

let reported = false

export function notePointerHover(input: 'pointer' | 'stylus') {
  if (reported) return
  reported = true
  analytics.capture('pointer_hover_detected', { input })
}
