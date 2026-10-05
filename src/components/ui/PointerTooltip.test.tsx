import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { slot } = vi.hoisted(() => ({
  slot: (name: string) => (props: React.PropsWithChildren) =>
    React.createElement(name, props),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  View: 'View',
  useWindowDimensions: () => ({ width: 1000, height: 800 }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {},
    fonts: {},
    numbers: { borderRadiusMd: 10 },
    fontSize: () => 14,
  }),
}))
vi.mock('@/components/ui/FullWindowOverlay', () => ({
  default: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock('@/components/ui/PointerHover', () => ({
  default: slot('PointerHover'),
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))

import PointerTooltip, {
  PointerTooltipLayer,
} from '@/components/ui/PointerTooltip'

let root: ReactTestRenderer

beforeEach(() => vi.useFakeTimers())
afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
})

const render = async (enabled = true) => {
  await act(async () => {
    root = create(
      <>
        <PointerTooltip label='Contacts' placement='right' enabled={enabled}>
          <React.Fragment />
        </PointerTooltip>
        <PointerTooltipLayer />
      </>,
      {
        createNodeMock: () => ({
          measureInWindow: (
            callback: (x: number, y: number, w: number, h: number) => void
          ) => callback(12, 100, 50, 50),
        }),
      }
    )
  })
}

const hover = (hovered: boolean) =>
  act(async () =>
    root.root.findByType('PointerHover' as never).props.onHoverChange(hovered)
  )
const label = () =>
  root.root.findAllByType('Text' as never).map((t) => t.props.children)

describe('PointerTooltip', () => {
  it('names the control after a resting hover and hides when it leaves', async () => {
    await render()
    await hover(true)
    expect(label()).toEqual([])

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(label()).toEqual(['Contacts'])

    await hover(false)
    expect(label()).toEqual([])
  })

  it('shows at once when moving straight to another control', async () => {
    await render()
    await hover(true)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    await hover(false)

    await hover(true)
    await act(async () => {
      vi.advanceTimersByTime(0)
    })
    expect(label()).toEqual(['Contacts'])
  })

  it('hides as soon as the control is clicked', async () => {
    await render()
    await hover(true)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    const anchor = root.root
      .findByType('PointerHover' as never)
      .findByType('View' as never)
    await act(async () => anchor.props.onTouchStart())
    expect(label()).toEqual([])
  })

  it('does nothing while disabled', async () => {
    await render(false)
    expect(
      root.root.findByType('PointerHover' as never).props.onHoverChange
    ).toBeUndefined()
  })
})
