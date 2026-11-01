import React, { useImperativeHandle } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

type Frame = { y: number; height: number }
type ScrollProps = {
  onScroll?: (event: { nativeEvent: { contentOffset: { y: number } } }) => void
  onLayout?: (event: object) => void
  onFocus?: (event: object) => void
  onBlur?: (event: object) => void
}

const runtime = vi.hoisted(() => ({
  view: { y: 100, height: 400 } as Frame,
  field: { y: 0, height: 40 } as Frame | null,
  props: {} as ScrollProps,
  scrollTo: vi.fn(),
}))

const measure =
  (frame: () => Frame) =>
  (callback: (x: number, y: number, w: number, h: number) => void) =>
    callback(0, frame().y, 300, frame().height)

vi.mock('react-native', () => ({
  TextInput: {
    State: {
      currentlyFocusedInput: () =>
        runtime.field && { measureInWindow: measure(() => runtime.field!) },
    },
  },
  ScrollView: ({
    ref,
    ...props
  }: ScrollProps & { ref?: React.Ref<unknown> }) => {
    runtime.props = props
    useImperativeHandle(ref, () => ({
      getNativeScrollRef: () => ({
        measureInWindow: measure(() => runtime.view),
      }),
      scrollTo: runtime.scrollTo,
    }))
    return null
  },
}))

import OnboardingScrollView from './OnboardingScrollView'

let renderer: ReactTestRenderer | undefined

const render = () =>
  act(() => {
    renderer = create(<OnboardingScrollView />)
  })

const scrollTo = (y: number) =>
  act(() => runtime.props.onScroll?.({ nativeEvent: { contentOffset: { y } } }))
const focus = () => act(() => runtime.props.onFocus?.({}))

const shrinkTo = (height: number) =>
  act(() => {
    runtime.view = { ...runtime.view, height }
    runtime.props.onLayout?.({})
  })

beforeEach(() => {
  runtime.view = { y: 100, height: 400 }
  runtime.field = { y: 200, height: 40 }
  runtime.scrollTo.mockClear()
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    callback()
    return 1
  })
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.unstubAllGlobals()
})

it('keeps the focused field above the bottom as the view shrinks', () => {
  render()
  scrollTo(30)
  focus()
  expect(runtime.scrollTo).not.toHaveBeenCalled()

  shrinkTo(300)
  expect(runtime.scrollTo).not.toHaveBeenCalled()

  shrinkTo(150)

  expect(runtime.scrollTo).toHaveBeenCalledWith({ y: 36, animated: false })
})

it('scrolls to a field focused below the bottom', () => {
  render()
  runtime.field = { y: 480, height: 40 }
  focus()
  expect(runtime.scrollTo).toHaveBeenCalledWith({ y: 36, animated: true })
})

it("leaves the view alone when the focused field isn't in it", () => {
  render()
  runtime.field = { y: 600, height: 40 }
  shrinkTo(200)
  expect(runtime.scrollTo).not.toHaveBeenCalled()

  focus()
  act(() => runtime.props.onBlur?.({}))
  runtime.scrollTo.mockClear()
  shrinkTo(150)
  expect(runtime.scrollTo).not.toHaveBeenCalled()
})
