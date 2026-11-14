import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import { reorderMenuActions } from '@/components/ui/reorderMenuActions'
import { menuGroups } from '@/components/ui/menuEntries'

const ids = (group: ReturnType<typeof reorderMenuActions>) =>
  menuGroups([group]).map((items) => items.map((item) => item.id))

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

  it('moves to the requested position', () => {
    const [[top]] = menuGroups([
      reorderMenuActions({ index: 2, count: 3, moveTo }),
    ])
    if ('onPress' in top) top.onPress()
    expect(moveTo).toHaveBeenCalledWith(0)
  })
})
