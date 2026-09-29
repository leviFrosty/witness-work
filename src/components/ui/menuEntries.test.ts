import { describe, expect, it, vi } from 'vitest'

const analytics = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics }))

import {
  flattenMenu,
  menuAccessibilityProps,
  menuGroups,
} from '@/components/ui/menuEntries'

const item = (id: string) => ({ id, title: id.toUpperCase(), onPress: vi.fn() })

describe('menuGroups', () => {
  it('groups loose items together and keeps explicit groups apart', () => {
    const a = item('a')
    const b = item('b')
    const c = item('c')
    expect(menuGroups([a, b, [c]])).toEqual([[a, b], [c]])
  })

  it('drops hidden items, empty submenus, and empty groups', () => {
    const a = item('a')
    const empty = { id: 'sub', title: 'Sub', actions: [] }
    expect(menuGroups([false, [null, undefined], [a, empty, false]])).toEqual([
      [a],
    ])
  })
})

describe('flattenMenu', () => {
  it('lists leaf actions with submenu-prefixed keys and labels', () => {
    const a = item('a')
    const one = item('one')
    const leaves = flattenMenu([
      [a, { id: 'delete', title: 'Delete', actions: [one] }],
    ])
    expect(leaves.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'a', label: 'A' },
      { key: 'delete.one', label: 'Delete: ONE' },
    ])
  })
})

describe('menuAccessibilityProps', () => {
  it('runs and records the chosen custom action', () => {
    const a = item('a')
    const props = menuAccessibilityProps([[a]], 'row')
    expect(props.accessibilityActions).toEqual([{ name: 'a', label: 'A' }])
    props.onAccessibilityAction?.({
      nativeEvent: { actionName: 'a' },
    } as never)
    expect(a.onPress).toHaveBeenCalledOnce()
    expect(analytics.capture).toHaveBeenCalledWith('context_menu_action', {
      surface: 'row',
      action: 'a',
      trigger: 'accessibility',
    })
  })

  it('adds nothing when the menu is empty', () => {
    expect(menuAccessibilityProps([], 'row')).toEqual({})
  })
})
