export const PEEK_FRACTION = 0.6

export type PeekWindowInput = {
  count: number

  visibleRows: number

  focusIndex: number | null

  lead?: number

  withoutFocus?: 'start' | 'end'
}

export const peekWindowScrolls = (count: number, visibleRows: number) =>
  count > visibleRows

export const peekWindowTopIndex = ({
  count,
  visibleRows,
  focusIndex,
  lead = 1,
  withoutFocus = 'start',
}: PeekWindowInput): number => {
  const last = Math.max(0, count - Math.max(1, visibleRows))
  if (focusIndex === null || focusIndex < 0 || focusIndex >= count)
    return withoutFocus === 'end' ? last : 0
  return Math.min(last, Math.max(0, focusIndex - lead))
}

export const peekWindowHeight = (
  count: number,
  visibleRows: number,
  rowHeight: number
): number | undefined =>
  peekWindowScrolls(count, visibleRows) && rowHeight > 0
    ? Math.round((visibleRows + PEEK_FRACTION) * rowHeight)
    : undefined
