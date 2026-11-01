import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { slot } = vi.hoisted(() => ({
  slot: (name: string) => (props: React.PropsWithChildren) =>
    React.createElement(name, props),
}))

vi.mock('@expo/ui', () => ({ Host: 'Host' }))
vi.mock('@expo/ui/swift-ui', () => ({ Picker: 'Picker', Text: 'SwiftText' }))
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  disabled: () => ({ $type: 'disabled' }),
  pickerStyle: (style: string) => ({ $type: 'pickerStyle', style }),
  tag: (tag: number) => ({ $type: 'tag', tag }),
}))
vi.mock('@expo/ui/jetpack-compose', () => ({
  SegmentedButton: Object.assign(slot('SegmentedButton'), {
    Label: slot('Label'),
  }),
  SingleChoiceSegmentedButtonRow: slot('SingleChoiceSegmentedButtonRow'),
  Text: 'ComposeText',
}))
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  fillMaxWidth: () => ({ $type: 'fillMaxWidth' }),
  testID: (tag: string) => ({ $type: 'testID', tag }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: { accent: '#accent' } }),
}))
const { largeText } = vi.hoisted(() => ({ largeText: { current: false } }))
vi.mock('@/hooks/useAccessibilityTextSize', () => ({
  default: () => largeText.current,
}))
vi.mock('@/components/ui/ChoiceChips', () => ({ default: 'ChoiceChips' }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (state: { colorScheme: string }) => unknown) =>
    select({ colorScheme: 'dark' }),
}))

import AndroidSegmentedControl from '@/components/ui/NativeSegmentedControl.android'
import IOSSegmentedControl from '@/components/ui/NativeSegmentedControl.ios'

type Period = 'day' | 'week' | 'month'

const options = [
  { key: 'day', label: 'Day', testID: 'period-day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
] as const

let root: ReactTestRenderer

afterEach(async () => {
  await act(async () => root.unmount())
  largeText.current = false
})

const render = async (element: React.ReactElement) => {
  await act(async () => {
    root = create(element)
  })
}

describe('iOS segmented control', () => {
  const picker = () => root.root.findByType('Picker' as never)
  const segments = () => root.root.findAllByType('SwiftText' as never)

  it('selects by key and reports the tapped key', async () => {
    const onChange = vi.fn()
    await render(
      <IOSSegmentedControl<Period>
        options={options}
        value='week'
        onChange={onChange}
      />
    )
    expect(root.root.findByType('Host' as never).props.colorScheme).toBe('dark')
    expect(picker().props.selection).toBe(1)
    expect(picker().props.modifiers).toEqual([
      { $type: 'pickerStyle', style: 'segmented' },
    ])
    expect(segments().map((s) => s.props.children)).toEqual([
      'Day',
      'Week',
      'Month',
    ])
    expect(segments()[2].props.modifiers).toEqual([{ $type: 'tag', tag: 2 }])
    expect(segments()[0].props.testID).toBe('period-day')

    picker().props.onSelectionChange(2)
    expect(onChange).toHaveBeenCalledWith('month')
  })

  it('shows no segment selected without a value, and can be disabled', async () => {
    await render(
      <IOSSegmentedControl<Period>
        options={options}
        value={null}
        onChange={vi.fn()}
        disabled
      />
    )
    expect(picker().props.selection).toBe(-1)
    expect(picker().props.modifiers).toContainEqual({ $type: 'disabled' })
  })
})

describe('Android segmented control', () => {
  const buttons = () => root.root.findAllByType('SegmentedButton' as never)

  it('selects by key, reports the tapped key, and tags segments', async () => {
    const onChange = vi.fn()
    await render(
      <AndroidSegmentedControl<Period>
        options={options}
        value='week'
        onChange={onChange}
        testID='period'
      />
    )
    const host = root.root.findByType('Host' as never)
    expect(host.props.colorScheme).toBe('dark')
    expect(host.props.seedColor).toBe('#accent')
    expect(
      root.root.findByType('SingleChoiceSegmentedButtonRow' as never).props
        .modifiers
    ).toEqual([{ $type: 'fillMaxWidth' }, { $type: 'testID', tag: 'period' }])
    expect(buttons().map((b) => b.props.selected)).toEqual([false, true, false])
    expect(buttons()[0].props.modifiers).toEqual([
      { $type: 'testID', tag: 'period-day' },
    ])
    expect(buttons().every((b) => b.props.enabled)).toBe(true)

    buttons()[2].props.onClick()
    expect(onChange).toHaveBeenCalledWith('month')
  })

  it('shows no segment selected without a value, and can be disabled', async () => {
    await render(
      <AndroidSegmentedControl<Period>
        options={options}
        value={undefined}
        onChange={vi.fn()}
        disabled
      />
    )
    expect(buttons().some((b) => b.props.selected)).toBe(false)
    expect(buttons().some((b) => b.props.enabled)).toBe(false)
  })

  it('shows chips that wrap at accessibility text sizes', async () => {
    largeText.current = true
    const onChange = vi.fn()
    await render(
      <AndroidSegmentedControl<Period>
        options={options}
        value='month'
        onChange={onChange}
        testID='period'
      />
    )
    expect(buttons()).toHaveLength(0)
    const chips = root.root.findByType('ChoiceChips' as never)
    expect(chips.props.options).toBe(options)
    expect(chips.props.value).toBe('month')
    expect(chips.props.testID).toBe('period')
    chips.props.onChange('day')
    expect(onChange).toHaveBeenCalledWith('day')
  })
})
