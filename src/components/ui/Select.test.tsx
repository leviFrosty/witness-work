import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ android: false }))
const { slot } = vi.hoisted(() => ({
  slot: (name: string) => (props: React.PropsWithChildren) =>
    React.createElement(name, props),
}))

vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }))
vi.mock('lucide-react-native', () => ({ ChevronDown: 'ChevronDown' }))
vi.mock('@/assets/icons/check.xml', () => ({ default: 1 }))
vi.mock('@react-native-menu/menu', () => ({ MenuView: 'MenuView' }))
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: 'ComposeHost',
  RNHostView: 'RNHostView',
  Text: 'ComposeText',
  Icon: 'ComposeIcon',
  Column: 'Column',
  DropdownMenu: Object.assign(slot('DropdownMenu'), {
    Trigger: slot('Trigger'),
    Items: slot('Items'),
  }),
  DropdownMenuItem: Object.assign(slot('DropdownMenuItem'), {
    Text: slot('ItemText'),
    TrailingIcon: slot('TrailingIcon'),
  }),
}))
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  selectable: (selected: boolean, onClick: () => void, role: string) => ({
    selected,
    onClick,
    role,
  }),
  selectableGroup: () => ({ selectableGroup: true }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { background: '#fff', card: '#fff', border: '#ddd', text: '#111' },
    numbers: { borderRadiusMd: 8 },
    fontSize: () => 16,
  }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (selector: (s: { colorScheme: string }) => unknown) =>
    selector({ colorScheme: 'dark' }),
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
// Exercise the shared control with each implementation Metro selects natively.
vi.mock('@/components/ui/SelectMenu', async (importOriginal) => {
  const ios = await importOriginal<typeof import('./SelectMenu')>()
  const android = await import('./SelectMenu.android')
  return {
    default: (props: import('./SelectMenu').SelectMenuProps) =>
      React.createElement(
        platform.android ? android.default : ios.default,
        props
      ),
  }
})

import Select from '@/components/ui/Select'

const data = [
  { label: 'First', value: 1 },
  { label: 'Second', value: 2 },
  { label: 'Third', value: 3 },
]
let root: ReactTestRenderer
let onChange = vi.fn<(item: (typeof data)[number]) => void>()

beforeEach(() => {
  onChange = vi.fn()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  vi.unstubAllGlobals()
})

const render = async (value: number | string | null = '2') => {
  await act(async () => {
    root = create(
      <Select
        data={data}
        value={value}
        onChange={onChange}
        placeholder='Choose'
        accessibilityLabel='Choice'
      />
    )
  })
}

describe('Android Select', () => {
  beforeEach(() => {
    platform.android = true
  })
  const menu = () => root.root.findByType('DropdownMenu' as never)
  const trigger = () => root.root.findByType('Pressable' as never)
  const items = () => root.root.findAllByType('DropdownMenuItem' as never)

  it('opens on tap and marks only the current choice, including coerced numeric values', async () => {
    await render()
    expect(trigger().props.accessibilityValue).toEqual({ text: 'Second' })
    expect(trigger().props.accessibilityLabel).toBe('Choice')
    expect(menu().props.expanded).toBe(false)
    await act(async () => trigger().props.onPress())
    expect(menu().props.expanded).toBe(true)
    expect(trigger().props.accessibilityState).toEqual({ expanded: true })
    expect(root.root.findAllByType('ComposeIcon' as never)).toHaveLength(1)
    expect(items().map((item) => item.props.modifiers[0].selected)).toEqual([
      false,
      true,
      false,
    ])
    expect(items()[1].props.modifiers[0].role).toBe('radioButton')
  })

  it('returns the original item once, dismisses, and shows the updated choice on reopening', async () => {
    await render()
    await act(async () => trigger().props.onPress())
    await act(async () => items()[2].props.onClick())
    expect(onChange).toHaveBeenCalledExactlyOnceWith(data[2])
    expect(onChange.mock.calls[0][0]).toBe(data[2])
    expect(menu().props.expanded).toBe(false)
    await act(async () => {
      root.update(<Select data={data} value={3} onChange={onChange} />)
    })
    await act(async () => trigger().props.onPress())
    expect(trigger().props.accessibilityValue).toEqual({ text: 'Third' })
    expect(items().map((item) => item.props.modifiers[0].selected)).toEqual([
      false,
      false,
      true,
    ])
  })

  it('dismisses without changing the choice', async () => {
    await render()
    await act(async () => trigger().props.onPress())
    await act(async () => menu().props.onDismissRequest())
    expect(menu().props.expanded).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger().props.accessibilityValue).toEqual({ text: 'Second' })
  })

  it('shows the placeholder with no selected item', async () => {
    await render(null)
    expect(trigger().props.accessibilityValue).toEqual({ text: 'Choose' })
    expect(root.root.findAllByType('ComposeIcon' as never)).toHaveLength(0)
    expect(items().every((item) => !item.props.modifiers[0].selected)).toBe(
      true
    )
  })
})

describe('iOS Select', () => {
  beforeEach(() => {
    platform.android = false
  })

  it('retains the native menu selection and original-item callback', async () => {
    await render()
    const menu = root.root.findByType('MenuView' as never)
    expect(menu.props.actions).toEqual([
      { id: '1', title: 'First', state: 'off' },
      { id: '2', title: 'Second', state: 'on' },
      { id: '3', title: 'Third', state: 'off' },
    ])
    await act(async () => {
      menu.props.onPressAction({ nativeEvent: { event: '1' } })
    })
    expect(onChange).toHaveBeenCalledExactlyOnceWith(data[0])
    expect(onChange.mock.calls[0][0]).toBe(data[0])
  })
})
