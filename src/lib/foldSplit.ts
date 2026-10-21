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
  /** The leading column's share of the space between the padding, or its width. */
  leading: { fraction: number } | { width: number }
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
      : Math.min(leading.width, inner - gap - minColumnWidth)
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
