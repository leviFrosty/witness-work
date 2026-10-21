export type Rect = { x: number; y: number; width: number; height: number }

/** The most space between two rows of a list, in points. */
const ROW_GAP = 32

/**
 * What someone is reading along the line at `line` (window coordinates), out of
 * the anchors laid out in one scroll view: the innermost one across the line,
 * the column read first when two sit side by side, or the row nearest the line
 * when it falls in the gap between rows. `into` is how far below the anchor's
 * top the line runs (negative above it).
 */
export function readingAnchor(
  candidates: { id: string; rect: Rect | null }[],
  line: number,
  rtl: boolean
): { id: string; into: number } | null {
  // One inside another (a row in a card): the inner one says more.
  const nested = (a: Rect, b: Rect) =>
    a.x < b.x + b.width && b.x < a.x + a.width
  const better = (rect: Rect, than: Rect) => {
    const covers = rect.y <= line
    const thanCovers = than.y <= line
    if (covers !== thanCovers) return covers
    if (!covers) return rect.y < than.y
    if (nested(rect, than)) return rect.height < than.height
    // Side by side, the column read first.
    return rtl ? rect.x > than.x : rect.x < than.x
  }
  let best: { id: string; rect: Rect } | null = null
  for (const { id, rect } of candidates) {
    if (!rect || rect.y + rect.height <= line) continue
    if (!best || better(rect, best.rect)) best = { id, rect }
  }
  if (!best) return null

  // In the gap between rows of a list, the nearest row says more than the card
  // around them all.
  const outer = best.rect
  const distance = (rect: Rect) =>
    rect.y > line ? rect.y - line : line - (rect.y + rect.height)
  let nearest: { id: string; rect: Rect } | null = null
  for (const { id, rect } of candidates) {
    if (!rect || id === best.id || rect.height >= outer.height) continue
    const inside =
      rect.y >= outer.y &&
      rect.y + rect.height <= outer.y + outer.height &&
      nested(rect, outer)
    if (!inside) continue
    if (!nearest || distance(rect) < distance(nearest.rect))
      nearest = { id, rect }
  }
  // Only across a gap: farther off, the line is on something else.
  if (nearest && distance(nearest.rect) <= ROW_GAP) best = nearest

  return { id: best.id, into: line - best.rect.y }
}
