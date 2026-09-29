import { describe, expect, it } from 'vitest'
import {
  isAllSelected,
  toggleAll,
  toggleId,
  visibleSelection,
} from '@/features/contacts/lib/listSelection'

describe('listSelection', () => {
  it('toggles an id in and out without mutating the input', () => {
    const empty = new Set<string>()
    const one = toggleId(empty, 'a')
    expect([...one]).toEqual(['a'])
    expect(empty.size).toBe(0)
    expect([...toggleId(one, 'a')]).toEqual([])
  })

  it('only counts selected ids still in the list, in list order', () => {
    const selected = new Set(['c', 'gone', 'a'])
    expect(visibleSelection(selected, ['a', 'b', 'c'])).toEqual(['a', 'c'])
  })

  it('knows when everything is selected', () => {
    expect(isAllSelected(new Set(['a', 'b']), ['a', 'b'])).toBe(true)
    expect(isAllSelected(new Set(['a']), ['a', 'b'])).toBe(false)
    expect(isAllSelected(new Set(), [])).toBe(false)
  })

  it('selects all, then clears on the second toggle', () => {
    const all = toggleAll(new Set(['a']), ['a', 'b'])
    expect([...all].sort()).toEqual(['a', 'b'])
    expect(toggleAll(all, ['a', 'b']).size).toBe(0)
  })
})
