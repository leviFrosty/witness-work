/** How far a swipe must travel before the header reacts. */
const COLLAPSE_DISTANCE = 24
/**
 * About what collapsing frees up; a list that only overflows by less would fit
 * once collapsed and bounce straight back.
 */
const MIN_OVERFLOW = 200

export type ListScrollTracker = { lastY: number; anchorY: number }

export type ListScrollFrame = {
  y: number
  contentHeight: number
  viewportHeight: number
}

/**
 * Reads one user-driven scroll frame and says whether the Contacts header
 * should collapse (`true`), expand (`false`), or stay put (`undefined`). Each
 * swipe is measured from where the scroll last turned around, so small wobbles
 * don't flicker it.
 */
export function trackListScroll(
  tracker: ListScrollTracker,
  { y, contentHeight, viewportHeight }: ListScrollFrame
): boolean | undefined {
  const lastY = tracker.lastY
  tracker.lastY = y
  // Ignore rubber-banding past either end.
  if (y < 0 || y > contentHeight - viewportHeight) return undefined
  if ((y - lastY) * (lastY - tracker.anchorY) < 0) tracker.anchorY = lastY
  if (y < COLLAPSE_DISTANCE) return false
  if (y - tracker.anchorY > COLLAPSE_DISTANCE) {
    return contentHeight > viewportHeight + MIN_OVERFLOW ? true : undefined
  }
  if (tracker.anchorY - y > COLLAPSE_DISTANCE) return false
  return undefined
}
