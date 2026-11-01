export type WindowRect = { x: number; y: number; width: number; height: number }

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
