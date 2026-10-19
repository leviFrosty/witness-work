/** How far a swipe must travel before the bars react. */
const SWIPE_DISTANCE = 24
/**
 * More than hiding frees up at default text size (the header plus, on Contacts,
 * its chip rows); content that only overflows by less would fit once they're
 * gone and bounce straight back. Scaled with the text size.
 */
const MIN_OVERFLOW = 240
/**
 * A jump this far in one frame soon after the content resized is rows going in
 * above (the list keeps them in place by shifting its offset), not a swipe.
 */
const INSERTION_JUMP = 60
/** Frames after a resize in which the list may still shift its offset. */
const INSERTION_FRAMES = 4

export type BarsScrollTracker = {
  lastY: number
  /** Where the scroll last turned around; each swipe is measured from here. */
  anchorY: number
  contentHeight: number
  viewportHeight: number
  /** Frames left in which a big jump still counts as rows going in above. */
  settling: number
  /** Overflow needed before hiding; see `MIN_OVERFLOW`. */
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

/**
 * Reads one user-driven scroll frame and says whether the bars should hide
 * (`true`), show (`false`), or stay put (`undefined`). Small wobbles don't
 * flicker them, and the frames where hiding the header resizes the viewport (or
 * rows go in above) don't count as swipes.
 */
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
  // Back at the top (or pulled past it) the bars always show.
  if (y < SWIPE_DISTANCE) return false
  if (resized || inserted) {
    tracker.anchorY = y
    return undefined
  }
  // Ignore rubber-banding past the end.
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

/** Content that fits without scrolling can't bring hidden bars back. */
export const fitsWithoutScrolling = (
  contentHeight: number,
  viewportHeight: number
) => viewportHeight > 0 && contentHeight <= viewportHeight + SWIPE_DISTANCE
