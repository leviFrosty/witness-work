import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type HoverEvent = { x: number; y: number; pointerType?: number }
type Handlers = {
  begin?: (event: HoverEvent) => void
  update?: (event: HoverEvent) => void
  finalize?: () => void
}

const mocks = vi.hoisted(() => ({
  handlers: {} as Handlers,
  getMarkersFrames: vi.fn(),
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios', isPad: true } }))
vi.mock('react-native-gesture-handler', () => ({
  PointerType: { STYLUS: 2 },
  Gesture: {
    Hover: () => {
      const gesture = {
        runOnJS: () => gesture,
        onBegin: (fn: Handlers['begin']) => (
          (mocks.handlers.begin = fn),
          gesture
        ),
        onUpdate: (fn: Handlers['update']) => (
          (mocks.handlers.update = fn),
          gesture
        ),
        onFinalize: (fn: Handlers['finalize']) => (
          (mocks.handlers.finalize = fn),
          gesture
        ),
      }
      return gesture
    },
  },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

import usePinHover from '@/features/map/hooks/usePinHover'

const frame = (x: number, y: number) => ({
  point: { x, y },
  frame: { x: x - 15, y: y - 45, width: 30, height: 50 },
})
const contacts = [{ id: 'a' }, { id: 'b' }]
const bounds = { left: 0, top: 0, right: 600, bottom: 800 }
const mapRef = { current: { getMarkersFrames: mocks.getMarkersFrames } }

let result: ReturnType<typeof usePinHover>
let root: ReactTestRenderer

const capture = (next: ReturnType<typeof usePinHover>) => {
  result = next
}

function Probe({ list }: { list: { id: string }[] }) {
  capture(usePinHover({ mapRef: mapRef as never, contacts: list, bounds }))
  return null
}

const hoverAt = (x: number, y: number) =>
  act(async () => mocks.handlers.update?.({ x, y }))

beforeEach(async () => {
  mocks.getMarkersFrames.mockReset()
  mocks.getMarkersFrames.mockResolvedValue({
    a: frame(100, 200),
    b: frame(300, 200),
    // The dropped pin isn't a contact.
    'new-contact-location': frame(500, 500),
  })
  await act(async () => {
    root = create(<Probe list={contacts} />)
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
})

describe('usePinHover', () => {
  it('names the pin under the pointer, reading frames once per camera', async () => {
    await hoverAt(100, 180)
    expect(result.pin?.id).toBe('a')
    await hoverAt(300, 180)
    expect(result.pin?.id).toBe('b')
    await hoverAt(200, 180)
    expect(result.pin).toBeUndefined()
    expect(mocks.getMarkersFrames).toHaveBeenCalledTimes(1)
  })

  it('ignores pins that are not contacts', async () => {
    await hoverAt(500, 480)
    expect(result.pin).toBeUndefined()
  })

  it('hides while the camera moves and re-reads frames once it settles', async () => {
    await hoverAt(100, 180)
    await act(async () => result.onRegionChangeStart?.())
    expect(result.pin).toBeUndefined()
    await hoverAt(100, 181)
    expect(mocks.getMarkersFrames).toHaveBeenCalledTimes(1)
    mocks.getMarkersFrames.mockResolvedValue({ a: frame(100, 400) })
    await act(async () => result.onRegionChangeComplete?.())
    expect(mocks.getMarkersFrames).toHaveBeenCalledTimes(2)
    // The pin moved out from under the still pointer.
    expect(result.pin).toBeUndefined()
    await hoverAt(100, 380)
    expect(result.pin?.id).toBe('a')
  })

  it('hides on a click, while dragging, and when hover ends', async () => {
    await hoverAt(100, 180)
    await act(async () => result.dismiss())
    expect(result.pin).toBeUndefined()

    await hoverAt(100, 180)
    await act(async () => result.setDragging(true))
    expect(result.pin).toBeUndefined()
    await hoverAt(100, 180)
    expect(result.pin).toBeUndefined()
    await act(async () => result.setDragging(false))

    await hoverAt(100, 180)
    expect(result.pin?.id).toBe('a')
    await act(async () => mocks.handlers.finalize?.())
    expect(result.pin).toBeUndefined()
  })

  it('drops frames when the contacts change', async () => {
    await hoverAt(100, 180)
    await act(async () => root.update(<Probe list={[{ id: 'b' }]} />))
    expect(result.pin).toBeUndefined()
    await hoverAt(100, 180)
    expect(mocks.getMarkersFrames).toHaveBeenCalledTimes(2)
    expect(result.pin).toBeUndefined()
  })

  it('points out a linked row’s pin until the row is left', async () => {
    await act(async () => result.linkContact('b', true))
    expect(result.pin?.id).toBe('b')
    // Entering the next row can arrive before leaving the previous one.
    await act(async () => result.linkContact('a', true))
    await act(async () => result.linkContact('b', false))
    expect(result.pin?.id).toBe('a')
    await act(async () => result.linkContact('a', false))
    expect(result.pin).toBeUndefined()
  })
})
