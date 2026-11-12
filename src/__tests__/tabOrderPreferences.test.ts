import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAB_ORDER,
  getEffectiveTabOrder,
  isTabAvailable,
  moveVisibleTab,
  type TabOrderKey,
} from '@/lib/tabOrderPreferences'

const FOUR: TabOrderKey[] = ['Home', 'Contacts', 'Progress', 'Schedule']

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
      'Territories',
    ])
  })

  it('adds Territories last to an order saved before it existed', () => {
    expect(
      getEffectiveTabOrder(['Schedule', 'Home', 'Contacts', 'Progress'])
    ).toEqual(['Schedule', 'Home', 'Contacts', 'Progress', 'Territories'])
  })

  it('keeps a moved Territories tab where it was put', () => {
    expect(
      getEffectiveTabOrder([
        'Home',
        'Territories',
        'Contacts',
        'Progress',
        'Schedule',
      ])
    ).toEqual(['Home', 'Territories', 'Contacts', 'Progress', 'Schedule'])
  })
})

describe('isTabAvailable', () => {
  const all = { showsYearTabs: true, territories: true }

  it('shows Territories only while the feature is on', () => {
    expect(isTabAvailable('Territories', all)).toBe(true)
    expect(isTabAvailable('Territories', { ...all, territories: false })).toBe(
      false
    )
  })

  it('shows Progress only for roles with year tabs', () => {
    expect(isTabAvailable('Progress', { ...all, showsYearTabs: false })).toBe(
      false
    )
  })

  it('leaves the original tabs alone when Territories is off', () => {
    const off = { showsYearTabs: true, territories: false }
    expect(
      getEffectiveTabOrder(undefined).filter((key) => isTabAvailable(key, off))
    ).toEqual(FOUR)
  })
})

describe('moveVisibleTab', () => {
  it('moves a tab up and down', () => {
    expect(moveVisibleTab(FOUR, FOUR, 2, 0)).toEqual([
      'Progress',
      'Home',
      'Contacts',
      'Schedule',
    ])
    expect(moveVisibleTab(FOUR, FOUR, 0, 3)).toEqual([
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

  it('keeps a hidden Territories tab in place while the others move', () => {
    expect(moveVisibleTab(DEFAULT_TAB_ORDER, FOUR, 3, 0)).toEqual([
      'Schedule',
      'Home',
      'Contacts',
      'Progress',
      'Territories',
    ])
  })

  it('ignores out-of-range moves', () => {
    expect(moveVisibleTab(DEFAULT_TAB_ORDER, DEFAULT_TAB_ORDER, 0, 9)).toBe(
      DEFAULT_TAB_ORDER
    )
  })
})
