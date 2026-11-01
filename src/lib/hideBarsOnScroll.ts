const SWIPE_DISTANCE = 24

const MIN_OVERFLOW = 240

const INSERTION_JUMP = 60

const INSERTION_FRAMES = 4

export type BarsScrollTracker = {
  lastY: number

  anchorY: number
  contentHeight: number
  viewportHeight: number

  settling: number

  minOverflow: number
}

export type BarsScrollFrame = {
  y: number
  contentHeight: number
  viewportHeight: number
}

export const createBarsScrollTracker = (fontScale = 1): BarsScrollTracker => ({
  lastY: 0,
  anchorY: 0,
  contentHeight: 0,
  viewportHeight: 0,
  settling: 0,
  minOverflow: MIN_OVERFLOW * Math.max(1, fontScale),
})

export function trackBarsScroll(
  tracker: BarsScrollTracker,
  { y, contentHeight, viewportHeight }: BarsScrollFrame
): boolean | undefined {
  const lastY = tracker.lastY
  const resized =
    tracker.viewportHeight !== 0 && viewportHeight !== tracker.viewportHeight
  if (tracker.contentHeight !== 0 && contentHeight !== tracker.contentHeight)
    tracker.settling = INSERTION_FRAMES
  else if (tracker.settling > 0) tracker.settling -= 1
  const inserted = tracker.settling > 0 && Math.abs(y - lastY) > INSERTION_JUMP
  tracker.lastY = y
  tracker.contentHeight = contentHeight
  tracker.viewportHeight = viewportHeight

  if (y < SWIPE_DISTANCE) return false
  if (resized || inserted) {
    tracker.anchorY = y
    return undefined
  }

  if (y > contentHeight - viewportHeight) return undefined
  if ((y - lastY) * (lastY - tracker.anchorY) < 0) tracker.anchorY = lastY
  if (y - tracker.anchorY > SWIPE_DISTANCE) {
    return contentHeight > viewportHeight + tracker.minOverflow
      ? true
      : undefined
  }
  if (tracker.anchorY - y > SWIPE_DISTANCE) return false
  return undefined
}

export const fitsWithoutScrolling = (
  contentHeight: number,
  viewportHeight: number
) => viewportHeight > 0 && contentHeight <= viewportHeight + SWIPE_DISTANCE
