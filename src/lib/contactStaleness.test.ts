import { describe, expect, it } from 'vitest'
import {
  STALENESS_DISPLAY_ORDER,
  getEffectiveStalenessChipOrder,
} from '@/lib/contactStaleness'

describe('getEffectiveStalenessChipOrder', () => {
  it('starts in display order', () => {
    expect(getEffectiveStalenessChipOrder(undefined)).toEqual(
      STALENESS_DISPLAY_ORDER
    )
  })

  it("keeps the User's order", () => {
    expect(
      getEffectiveStalenessChipOrder(['recent', 'never', 'month', 'week'])
    ).toEqual(['recent', 'never', 'month', 'week'])
  })

  it('drops unknown or repeated buckets and appends missing ones', () => {
    expect(
      getEffectiveStalenessChipOrder(['recent', 'someday', 'recent'])
    ).toEqual(['recent', 'month', 'week', 'never'])
  })
})
