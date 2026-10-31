import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/Switch', () => ({ default: 'Switch' }))
vi.mock('@/components/ui/inputs/InputRowContainer', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('Row', props),
}))

import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

function render(value: boolean, onValueChange: (value: boolean) => void) {
  act(() => {
    renderer = create(
      <InputRowSwitch
        label='Saved it'
        value={value}
        onValueChange={onValueChange}
      />
    )
  })
  return renderer!.root
}

describe('InputRowSwitch', () => {
  it('toggles from anywhere on the row, not only the switch', () => {
    const onValueChange = vi.fn()
    const off = render(false, onValueChange)
    act(() => off.findByType('Row' as never).props.onRowPress())
    expect(onValueChange).toHaveBeenLastCalledWith(true)

    const on = render(true, onValueChange)
    act(() => on.findByType('Row' as never).props.onRowPress())
    expect(onValueChange).toHaveBeenLastCalledWith(false)
  })

  it('leaves the switch as the one control screen readers reach', () => {
    const root = render(false, vi.fn())
    const row = root.findByType('Row' as never).props
    expect(row.labelReadByControl).toBe(true)
    expect(root.findByType('Switch' as never).props.accessibilityLabel).toBe(
      'Saved it'
    )
  })
})
