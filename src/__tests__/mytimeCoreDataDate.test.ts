import { describe, it, expect } from 'vitest'
import {
  coreDataRefToDate,
  coreDataRefToDateOrNull,
} from '@/features/mytime-import/lib/coreDataDate'

describe('coreDataRefToDate', () => {
  it('treats 0 as the Core Data reference epoch (2001-01-01 UTC)', () => {
    expect(coreDataRefToDate(0).toISOString()).toBe('2001-01-01T00:00:00.000Z')
  })

  it('converts a real pre-2001 (negative) pioneer start ref', () => {
    // Tenure dates routinely predate the Core Data epoch.
    expect(coreDataRefToDate(-357654799).toISOString()).toBe(
      '1989-09-01T11:26:41.000Z'
    )
  })
})

describe('coreDataRefToDateOrNull', () => {
  it('returns null for null/undefined (MyTime dates are frequently absent)', () => {
    expect(coreDataRefToDateOrNull(null)).toBeNull()
    expect(coreDataRefToDateOrNull(undefined)).toBeNull()
  })

  it('converts a present timestamp the same as coreDataRefToDate', () => {
    expect(coreDataRefToDateOrNull(0)?.toISOString()).toBe(
      '2001-01-01T00:00:00.000Z'
    )
  })
})
