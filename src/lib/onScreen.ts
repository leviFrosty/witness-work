/** A view's frame in window points, as `measureInWindow` reports it. */
export type WindowRect = { x: number; y: number; width: number; height: number }

/**
 * Whether any of `rect` is inside the window. A view not laid out yet (no size)
 * counts as on screen, so a scene never waits for its first measurement.
 */
export function isOnScreen(
  rect: WindowRect,
  window: { width: number; height: number }
): boolean {
  if (rect.width <= 0 || rect.height <= 0) return true
  return (
    rect.x < window.width &&
    rect.x + rect.width > 0 &&
    rect.y < window.height &&
    rect.y + rect.height > 0
  )
}
