import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { defaultValue?: string }) =>
      ({ ldc: 'Construction', standard: 'Standard', custom: 'Custom' })[key] ??
      options?.defaultValue ??
      key,
  },
}))

import { categoryLabel, planTypeLabel } from '@/lib/planTypeLabel'
import {
  LDC_BUILTIN_CATEGORY_ID,
  makeLdcBuiltinCategory,
} from '@/constants/categories'

const ldc = makeLdcBuiltinCategory(0)
const cart = { id: 'cart', name: 'Cart', isCredit: false }

describe('categoryLabel', () => {
  it('names LDC in the app’s language, whatever its stored name', () => {
    expect(categoryLabel(ldc)).toBe('Construction')
  })

  it('keeps a User’s own name, translating one of the app’s keys', () => {
    expect(categoryLabel(cart)).toBe('Cart')
    expect(categoryLabel({ id: 'c', name: 'custom', isCredit: false })).toBe(
      'Custom'
    )
  })
})

describe('planTypeLabel', () => {
  it('names a Plan’s Type, or Standard without one', () => {
    const categories = [ldc, cart]
    expect(
      planTypeLabel({ categoryId: LDC_BUILTIN_CATEGORY_ID }, categories)
    ).toBe('Construction')
    expect(planTypeLabel({ categoryId: 'cart' }, categories)).toBe('Cart')
    expect(planTypeLabel({ categoryId: 'gone' }, categories)).toBe('Standard')
    expect(planTypeLabel({}, categories)).toBe('Standard')
  })
})
