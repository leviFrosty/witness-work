import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { rtl } = vi.hoisted(() => ({ rtl: { value: false } }))

vi.mock('react-native-reanimated', () => ({
  default: { View: 'View' },
  useAnimatedStyle: (style: () => object) => style(),
}))
vi.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  default: 'Swipeable',
  SwipeDirection: { LEFT: 'left', RIGHT: 'right' },
}))
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

type Render = (progress: { value: number }) => React.ReactNode

const actions = async (render: Render, progress = 0.5) => {
  let side!: ReactTestRenderer
  await act(async () => {
    side = create(<>{render({ value: progress })}</>)
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

  it('shows the actions only once the row moves', async () => {
    const props = await render()
    const opacity = async (progress: number) => {
      const left = await actions(props.renderLeftActions, progress)
      const style = left.findByType('Leading' as never).parent!.props.style
      return Object.assign({}, ...style).opacity
    }
    expect(await opacity(0)).toBe(0)
    expect(await opacity(0.2)).toBe(1)
  })

  it('puts the leading actions on the right in right-to-left layouts', async () => {
    rtl.value = true
    const props = await render()
    const right = await actions(props.renderRightActions)
    expect(right.findAllByType('Leading' as never)).toHaveLength(1)
    const left = await actions(props.renderLeftActions)
    expect(left.findAllByType('Trailing' as never)).toHaveLength(1)
  })

  it('names the opened side by where its actions sit', async () => {
    const opened = vi.fn()
    const willOpen = vi.fn()
    await act(async () => {
      root = create(
        <SwipeableRow onSwipeableOpen={opened} onSwipeableWillOpen={willOpen} />
      )
    })
    const props = root.root.findByType('Swipeable' as never).props

    props.onSwipeableWillOpen('right')
    props.onSwipeableWillOpen('left')
    expect(willOpen.mock.calls).toEqual([['leading'], ['trailing']])

    props.onSwipeableOpen('right')
    expect(opened).not.toHaveBeenCalled()
  })

  it('swaps the opened side in right-to-left layouts', async () => {
    rtl.value = true
    const willOpen = vi.fn()
    await act(async () => {
      root = create(<SwipeableRow onSwipeableWillOpen={willOpen} />)
    })
    const props = root.root.findByType('Swipeable' as never).props
    props.onSwipeableWillOpen('right')
    expect(willOpen).toHaveBeenCalledWith('trailing')
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
