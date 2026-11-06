import { logger } from '@/lib/logger'
import { captureExceptionThrottled } from '@/lib/throttledErrorReport'

let reported = false

/**
 * Reports, once a session, that a Skia surface couldn't draw: CanvasKit didn't
 * download, the browser has no WebGL, or a canvas failed. The surface shows its
 * quiet fallback instead, so nothing else is said to the User.
 */
export function reportCanvasKitFailure(error: unknown) {
  if (reported) return
  reported = true
  logger.warn('[canvasKit] Skia surfaces fall back:', error)
  captureExceptionThrottled('canvasKit', error, undefined, Infinity)
}
