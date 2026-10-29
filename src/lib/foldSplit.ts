/** A fold in the split container's coordinates. */
export type FoldDivision = {
  x: number
  y: number
  width: number
  height: number
  active: boolean
}

export type FoldSplitInput = {
  /** The container's width, padding included. */
  width: number
  paddingHorizontal: number
  gap: number
  /**
   * The leading column's share of the space between the padding, its width, or
   * the trailing column's width (the leading one takes the rest).
   */
  leading: { fraction: number } | { width: number } | { trailingWidth: number }
  /** Neither column narrows below this to meet the fold. */
  minColumnWidth: number
  divisions: readonly FoldDivision[]
  rtl: boolean
}

/**
 * Where a two-column split puts its columns: its usual proportions while the
 * display is flat, and one column on each side of the fold while iPhone Duo is
 * partly folded like a book.
 */
export function getFoldSplit({
  width,
  paddingHorizontal,
  gap,
  leading,
  minColumnWidth,
  divisions,
  rtl,
}: FoldSplitInput) {
  const inner = Math.max(0, width - paddingHorizontal * 2)
  const flat =
    'fraction' in leading
      ? (inner - gap) * leading.fraction
      : 'width' in leading
        ? Math.min(leading.width, inner - gap - minColumnWidth)
        : Math.max(minColumnWidth, inner - gap - leading.trailingWidth)
  const flatSplit = {
    leadingWidth: Math.max(0, Math.round(flat)),
    gap,
    folded: false,
  }

  // A laptop-style fold runs across both columns, which scroll past it.
  const fold = divisions.find(
    (division) => division.active && division.height > division.width
  )
  if (!fold) return flatSplit

  const foldGap = Math.max(gap, fold.width)
  const middle = fold.x + fold.width / 2
  // In right-to-left layouts the leading column is on the right of the fold.
  const leadingWidth = rtl
    ? width - paddingHorizontal - (middle + foldGap / 2)
    : middle - foldGap / 2 - paddingHorizontal
  const trailingWidth = inner - leadingWidth - foldGap
  if (leadingWidth < minColumnWidth || trailingWidth < minColumnWidth)
    return flatSplit

  return {
    leadingWidth: Math.round(leadingWidth),
    gap: Math.round(foldGap),
    folded: true,
  }
}

export type FoldPaneInput = {
  /** The container's width. */
  width: number
  divisions: readonly FoldDivision[]
  rtl: boolean
}

/**
 * Where something centered on the window goes while iPhone Duo is partly folded
 * like a book: the inset from each physical edge that keeps it on one side of
 * the fold, as the system does with alerts and sheets. Null while the display
 * is flat, or when the fold leaves no usable side.
 */
export function getFoldPane({ width, divisions, rtl }: FoldPaneInput) {
  const fold = divisions.find(
    (division) => division.active && division.height > division.width
  )
  if (!fold) return null
  const leftWidth = fold.x
  const rightWidth = width - (fold.x + fold.width)
  if (leftWidth <= 0 || rightWidth <= 0) return null
  // The leading side, so it reads first.
  return rtl
    ? { left: fold.x + fold.width, right: 0 }
    : { left: 0, right: width - fold.x }
}

export type FoldSideClampInput = {
  /** The content's physical x and width, in window coordinates. */
  x: number
  width: number
  /** The physical x of what it's anchored to: it stays on that side. */
  anchorX: number
  windowWidth: number
  divisions: readonly FoldDivision[]
  /** The window's physical side insets (iPhone Duo's vertical bar). */
  insets: { left: number; right: number }
  margin: number
}

/**
 * Moves anchored content (a popover) along x so it stays clear of the side
 * insets and, while iPhone Duo is partly folded like a book, on the side of the
 * fold its anchor is on. Content too wide for that space keeps its place.
 */
export function clampToFoldSide({
  x,
  width,
  anchorX,
  windowWidth,
  divisions,
  insets,
  margin,
}: FoldSideClampInput) {
  let start = insets.left
  let end = windowWidth - insets.right
  const fold = divisions.find(
    (division) => division.active && division.height > division.width
  )
  if (fold) {
    if (anchorX < fold.x + fold.width / 2) end = Math.min(end, fold.x)
    else start = Math.max(start, fold.x + fold.width)
  }
  const min = start + margin
  const max = end - margin - width
  if (max < min) return x
  return Math.min(Math.max(x, min), max)
}

export type FoldColumnInput = {
  /** The width of the area the column is centered in. */
  width: number
  /** That area's pane (`getFoldPane`), or null while the display is flat. */
  pane: { left: number; right: number } | null
  maxWidth: number
  rtl: boolean
}

/**
 * Where a centered column of at most `maxWidth` goes in an area while iPhone
 * Duo is partly folded: centered in the pane on the leading side of the fold,
 * as `width` and `start` (the distance from the area's reading-order start).
 * Null while the display is flat, when it stays centered in the whole area.
 */
export function getFoldColumn({ width, pane, maxWidth, rtl }: FoldColumnInput) {
  if (!pane) return null
  const paneWidth = Math.max(0, width - pane.left - pane.right)
  const columnWidth = Math.min(maxWidth, paneWidth)
  const paneStart = rtl ? pane.right : pane.left
  return {
    width: Math.round(columnWidth),
    start: Math.round(paneStart + (paneWidth - columnWidth) / 2),
  }
}
