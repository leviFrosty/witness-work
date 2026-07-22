import { describe, expect, it } from 'vitest'

import { buildPaginationModel, PAGINATION_ELLIPSIS } from '@/lib/pagination'

describe('buildPaginationModel', () => {
  it('returns no items when there are no pages', () => {
    expect(buildPaginationModel({ page: 1, pageCount: 0 })).toEqual({
      page: 1,
      pageCount: 0,
      items: [],
      hasPrevious: false,
      hasNext: false,
    })
  })

  it('shows every page when there are five or fewer', () => {
    expect(buildPaginationModel({ page: 3, pageCount: 5 })).toEqual({
      page: 3,
      pageCount: 5,
      items: [1, 2, 3, 4, 5],
      hasPrevious: true,
      hasNext: true,
    })
  })

  it('uses a trailing ellipsis near the beginning', () => {
    expect(buildPaginationModel({ page: 2, pageCount: 10 }).items).toEqual([
      1,
      2,
      3,
      PAGINATION_ELLIPSIS,
      10,
    ])
  })

  it('uses ellipses on both sides in the middle', () => {
    expect(buildPaginationModel({ page: 5, pageCount: 10 }).items).toEqual([
      1,
      PAGINATION_ELLIPSIS,
      5,
      PAGINATION_ELLIPSIS,
      10,
    ])
  })

  it('uses a leading ellipsis near the end', () => {
    expect(buildPaginationModel({ page: 9, pageCount: 10 }).items).toEqual([
      1,
      PAGINATION_ELLIPSIS,
      8,
      9,
      10,
    ])
  })

  it('normalizes invalid page inputs and endpoint state', () => {
    expect(buildPaginationModel({ page: 99, pageCount: 4.9 })).toEqual({
      page: 4,
      pageCount: 4,
      items: [1, 2, 3, 4],
      hasPrevious: true,
      hasNext: false,
    })
    expect(
      buildPaginationModel({ page: Number.NaN, pageCount: Infinity })
    ).toEqual({
      page: 1,
      pageCount: 0,
      items: [],
      hasPrevious: false,
      hasNext: false,
    })
  })
})
