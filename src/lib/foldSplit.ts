export type FoldDivision = {
  x: number
  y: number
  width: number
  height: number
  active: boolean
}

export type FoldSplitInput = {
  width: number
  paddingHorizontal: number
  gap: number

  leading: { fraction: number } | { width: number } | { trailingWidth: number }

  minColumnWidth: number
  divisions: readonly FoldDivision[]
  rtl: boolean
}

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

  const fold = divisions.find(
    (division) => division.active && division.height > division.width
  )
  if (!fold) return flatSplit

  const foldGap = Math.max(gap, fold.width)
  const middle = fold.x + fold.width / 2

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
  width: number
  divisions: readonly FoldDivision[]
  rtl: boolean
}

export function getFoldPane({ width, divisions, rtl }: FoldPaneInput) {
  const fold = divisions.find(
    (division) => division.active && division.height > division.width
  )
  if (!fold) return null
  const leftWidth = fold.x
  const rightWidth = width - (fold.x + fold.width)
  if (leftWidth <= 0 || rightWidth <= 0) return null

  return rtl
    ? { left: fold.x + fold.width, right: 0 }
    : { left: 0, right: width - fold.x }
}

export type FoldSideClampInput = {
  x: number
  width: number

  anchorX: number
  windowWidth: number
  divisions: readonly FoldDivision[]

  insets: { left: number; right: number }
  margin: number
}

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
  width: number

  pane: { left: number; right: number } | null
  maxWidth: number
  rtl: boolean
}

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
