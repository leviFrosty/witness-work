import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { rtl } = vi.hoisted(() => ({ rtl: { value: false } }))

vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('react-native-gesture-handler', () => ({ Swipeable: 'Swipeable' }))
vi.mock('@/lib/direction', () => ({ isRtlLayout: () => rtl.value }))

import SwipeableRow from '@/components/ui/SwipeableRow'

let root: ReactTestRenderer

afterEach(async () => {
  rtl.value = false
  await act(async () => root.unmount())
})

const render = async () => {
  await act(async () => {
    root = create(
      <SwipeableRow
        renderLeadingActions={() => React.createElement('Leading')}
        renderTrailingActions={() => React.createElement('Trailing')}
      />
    )
  })
  return root.root.findByType('Swipeable' as never).props
}

/** Renders one side's actions the way `Swipeable` would. */
const actions = async (render: () => React.ReactNode) => {
  let side!: ReactTestRenderer
  await act(async () => {
    side = create(<>{render()}</>)
  })
  return side.root
}

describe('SwipeableRow', () => {
  it('keeps its swipe actions away from screen readers', async () => {
    const props = await render()
    const left = await actions(props.renderLeftActions)
    const wrapper = left.findByType('Leading' as never).parent!
    expect(wrapper.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    })
    const right = await actions(props.renderRightActions)
    expect(
      right.findByType('Trailing' as never).parent!.props
        .accessibilityElementsHidden
    ).toBe(true)
  })

  it('puts the leading actions on the right in right-to-left layouts', async () => {
    rtl.value = true
    const props = await render()
    const right = await actions(props.renderRightActions)
    expect(right.findAllByType('Leading' as never)).toHaveLength(1)
    const left = await actions(props.renderLeftActions)
    expect(left.findAllByType('Trailing' as never)).toHaveLength(1)
  })

  it('renders no side that has no actions', async () => {
    await act(async () => {
      root = create(<SwipeableRow />)
    })
    const props = root.root.findByType('Swipeable' as never).props
    expect(props.renderLeftActions).toBeUndefined()
    expect(props.renderRightActions).toBeUndefined()
  })
})
