import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))

import {
  moveItem,
  reorderMenuActions,
} from '@/features/settings/components/shared/reorderMenuActions'
import { menuGroups } from '@/components/ui/menuEntries'

const ids = (entries: ReturnType<typeof reorderMenuActions>) =>
  menuGroups(entries).map((group) => group.map((item) => item.id))

describe('reorderMenuActions', () => {
  const moveTo = vi.fn()

  it('hides moves that would do nothing or repeat a single step', () => {
    expect(ids(reorderMenuActions({ index: 0, count: 4, moveTo }))).toEqual([
      ['move_down', 'move_to_bottom'],
    ])
    expect(ids(reorderMenuActions({ index: 1, count: 3, moveTo }))).toEqual([
      ['move_up', 'move_down'],
    ])
    expect(ids(reorderMenuActions({ index: 3, count: 4, moveTo }))).toEqual([
      ['move_to_top', 'move_up'],
    ])
    expect(ids(reorderMenuActions({ index: 0, count: 1, moveTo }))).toEqual([])
  })

  it('offers the opposite of the current visibility', () => {
    const setVisible = vi.fn()
    const entries = reorderMenuActions({
      index: 0,
      count: 1,
      moveTo,
      visible: true,
      setVisible,
    })
    const [[hide]] = menuGroups(entries)
    expect(hide.id).toBe('hide')
    if ('onPress' in hide) hide.onPress()
    expect(setVisible).toHaveBeenCalledWith(false)
  })

  it('moves to the requested position', () => {
    const [[top]] = menuGroups(
      reorderMenuActions({ index: 2, count: 3, moveTo })
    )
    if ('onPress' in top) top.onPress()
    expect(moveTo).toHaveBeenCalledWith(0)
  })
})

describe('moveItem', () => {
  it('moves an item without disturbing the rest', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a'])
  })
})
