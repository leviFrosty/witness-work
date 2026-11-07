import { logger } from '@/lib/logger'
import { captureExceptionThrottled } from '@/lib/throttledErrorReport'

let reported = false

export function reportCanvasKitFailure(error: unknown) {
  if (reported) return
  reported = true
  logger.warn('[canvasKit] Skia surfaces fall back:', error)
  captureExceptionThrottled('canvasKit', error, undefined, Infinity)
}
