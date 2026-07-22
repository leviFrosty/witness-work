export const PAGINATION_ELLIPSIS = 'ellipsis' as const

export type PaginationItem = number | typeof PAGINATION_ELLIPSIS

export type PaginationModel = {
  page: number
  pageCount: number
  items: PaginationItem[]
  hasPrevious: boolean
  hasNext: boolean
}

const pageRange = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, index) => start + index)

/**
 * Builds a compact, stable pagination range with at most five numbered or
 * ellipsis items. Input is normalized so rendering callers do not need their
 * own clamping or invalid-count branches.
 */
export const buildPaginationModel = ({
  page,
  pageCount,
}: {
  /** One-based current page. */
  page: number
  pageCount: number
}): PaginationModel => {
  const normalizedPageCount = Math.max(
    0,
    Math.trunc(Number.isFinite(pageCount) ? pageCount : 0)
  )
  const normalizedPage =
    normalizedPageCount === 0
      ? 1
      : Math.min(
          normalizedPageCount,
          Math.max(1, Math.trunc(Number.isFinite(page) ? page : 1))
        )

  if (normalizedPageCount === 0) {
    return {
      page: normalizedPage,
      pageCount: normalizedPageCount,
      items: [],
      hasPrevious: false,
      hasNext: false,
    }
  }

  const items: PaginationItem[] = (() => {
    if (normalizedPageCount <= 5) {
      return pageRange(1, normalizedPageCount)
    }
    if (normalizedPage <= 3) {
      return [1, 2, 3, PAGINATION_ELLIPSIS, normalizedPageCount]
    }
    if (normalizedPage >= normalizedPageCount - 2) {
      return [
        1,
        PAGINATION_ELLIPSIS,
        normalizedPageCount - 2,
        normalizedPageCount - 1,
        normalizedPageCount,
      ]
    }
    return [
      1,
      PAGINATION_ELLIPSIS,
      normalizedPage,
      PAGINATION_ELLIPSIS,
      normalizedPageCount,
    ]
  })()

  return {
    page: normalizedPage,
    pageCount: normalizedPageCount,
    items,
    hasPrevious: normalizedPage > 1,
    hasNext: normalizedPage < normalizedPageCount,
  }
}
