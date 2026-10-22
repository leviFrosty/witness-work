import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const runtime = vi.hoisted(() => ({
  focused: true,
  appActive: true,
  onScreen: true,
  measuring: [] as boolean[],
  setActive: vi.fn(),
  frame: undefined as
    | ((info: { timeSincePreviousFrame: number | null }) => void)
    | undefined,
  time: undefined as { value: number } | undefined,
}))

vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('@shopify/react-native-skia', () => ({
  Canvas: 'Canvas',
  RoundedRect: 'RoundedRect',
  SweepGradient: 'SweepGradient',
  vec: (x: number, y: number) => ({ x, y }),
}))
vi.mock('react-native-reanimated', () => ({
  useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
  useFrameCallback: (
    callback: (info: { timeSincePreviousFrame: number | null }) => void
  ) => {
    runtime.frame = callback
    return { setActive: runtime.setActive }
  },
  useSharedValue: <T,>(value: T) => {
    const shared = { value }
    runtime.time = shared as { value: number }
    return shared
  },
}))
vi.mock('@react-navigation/native', () => ({
  useIsFocused: () => runtime.focused,
}))
vi.mock('@/hooks/useAppActive', () => ({
  default: () => runtime.appActive,
}))
vi.mock('@/hooks/useOnScreen', () => ({
  default: (_: unknown, enabled: boolean) => {
    runtime.measuring.push(enabled)
    return runtime.onScreen
  },
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: new Proxy({}, { get: () => '#000' }) }),
}))

import SupporterCtaButton from '@/features/supporter/components/SupporterCtaButton'

let root: ReactTestRenderer | undefined

const render = (props: { shimmer?: boolean; disabled?: boolean } = {}) => {
  const element = (
    <SupporterCtaButton onPress={() => {}} shimmer {...props}>
      {null}
    </SupporterCtaButton>
  )
  act(() => {
    if (root) root.update(element)
    else root = create(element)
  })
}
/** Lays the button out, as the first native layout pass does. */
const layOut = () =>
  act(() =>
    root!.root
      .find((node) => typeof node.props.onLayout === 'function')
      .props.onLayout({ nativeEvent: { layout: { width: 300, height: 52 } } })
  )
const rerender = () => render()
const lastActive = () => runtime.setActive.mock.calls.at(-1)?.[0]

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})
beforeEach(() => {
  runtime.focused = true
  runtime.appActive = true
  runtime.onScreen = true
  runtime.measuring = []
  runtime.setActive.mockClear()
})
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
})

describe('SupporterCtaButton shimmer', () => {
  it('turns the rim once laid out on a focused, visible screen', () => {
    render()
    expect(lastActive()).toBe(false)
    layOut()
    expect(lastActive()).toBe(true)
    expect(runtime.measuring.at(-1)).toBe(true)
  })

  it('stops while its screen is not focused', () => {
    render()
    layOut()
    runtime.focused = false
    rerender()
    expect(lastActive()).toBe(false)
    expect(runtime.measuring.at(-1)).toBe(false)
    runtime.focused = true
    rerender()
    expect(lastActive()).toBe(true)
  })

  it('stops while the app is in the background', () => {
    render()
    layOut()
    runtime.appActive = false
    rerender()
    expect(lastActive()).toBe(false)
    runtime.appActive = true
    rerender()
    expect(lastActive()).toBe(true)
  })

  it('stops while scrolled off screen', () => {
    render()
    layOut()
    runtime.onScreen = false
    rerender()
    expect(lastActive()).toBe(false)
  })

  it('stays still while disabled', () => {
    render({ disabled: true })
    layOut()
    expect(lastActive()).toBe(false)
    expect(runtime.measuring.every((enabled) => !enabled)).toBe(true)
  })

  it('stops the frame callback on unmount', () => {
    render()
    layOut()
    expect(lastActive()).toBe(true)
    act(() => root!.unmount())
    root = undefined
    expect(lastActive()).toBe(false)
  })

  it('resumes the turn where it paused instead of jumping', () => {
    render()
    layOut()
    runtime.frame!({ timeSincePreviousFrame: 16 })
    runtime.frame!({ timeSincePreviousFrame: 5_000 })
    expect(runtime.time!.value).toBeCloseTo(0.08)
  })

  it('never starts a frame callback without the shimmer', () => {
    render({ shimmer: false })
    expect(runtime.setActive).not.toHaveBeenCalled()
  })
})
