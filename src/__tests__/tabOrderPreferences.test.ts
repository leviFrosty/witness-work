import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAB_ORDER,
  getEffectiveTabOrder,
  moveVisibleTab,
} from '@/lib/tabOrderPreferences'

describe('getEffectiveTabOrder', () => {
  it('falls back to the default order', () => {
    expect(getEffectiveTabOrder(undefined)).toEqual(DEFAULT_TAB_ORDER)
  })

  it('keeps the saved order, drops unknown keys, and appends missing ones', () => {
    expect(getEffectiveTabOrder(['Contacts', 'Tools', 'Home'])).toEqual([
      'Contacts',
      'Home',
      'Progress',
      'Schedule',
    ])
  })
})

describe('moveVisibleTab', () => {
  it('moves a tab up and down', () => {
    expect(moveVisibleTab(DEFAULT_TAB_ORDER, DEFAULT_TAB_ORDER, 2, 0)).toEqual([
      'Progress',
      'Home',
      'Contacts',
      'Schedule',
    ])
    expect(moveVisibleTab(DEFAULT_TAB_ORDER, DEFAULT_TAB_ORDER, 0, 3)).toEqual([
      'Contacts',
      'Progress',
      'Schedule',
      'Home',
    ])
  })

  it('leaves hidden tabs where they were', () => {
    const order = ['Home', 'Progress', 'Schedule', 'Contacts'] as const
    const visible = ['Home', 'Schedule', 'Contacts'] as const
    expect(moveVisibleTab([...order], [...visible], 0, 1)).toEqual([
      'Progress',
      'Schedule',
      'Home',
      'Contacts',
    ])
  })

  it('ignores out-of-range moves', () => {
    expect(moveVisibleTab(DEFAULT_TAB_ORDER, DEFAULT_TAB_ORDER, 0, 9)).toBe(
      DEFAULT_TAB_ORDER
    )
  })
})
