import { describe, expect, it, vi } from 'vitest'
import { act, create } from 'react-test-renderer'
import HorizontalDragScroll from './HorizontalDragScroll.web'

function createFakeDom({
  scrollWidth = 1000,
  clientWidth = 400,
  overflowX = 'auto',
}: {
  scrollWidth?: number
  clientWidth?: number
  overflowX?: string
} = {}) {
  const listeners = new Map<string, Set<EventListener>>()
  const makeTarget = () => {
    const map = new Map<string, Set<EventListener>>()
    return {
      listeners: map,
      addEventListener(type: string, fn: EventListener) {
        const set = map.get(type) ?? new Set()
        set.add(fn)
        map.set(type, set)
      },
      removeEventListener(type: string, fn: EventListener) {
        map.get(type)?.delete(fn)
      },
      dispatch(type: string, event: Record<string, unknown>) {
        for (const fn of [...(map.get(type) ?? [])]) {
          fn(event as unknown as Event)
        }
      },
    }
  }

  const boxTarget = makeTarget()
  const scrollerTarget = makeTarget()
  const winTarget = makeTarget()

  const scroller = {
    scrollWidth,
    clientWidth,
    scrollLeft: 0,
    style: { scrollSnapType: '', cursor: '', userSelect: '' },
    parentElement: null as unknown,
    addEventListener: scrollerTarget.addEventListener,
    removeEventListener: scrollerTarget.removeEventListener,
    dispatch: scrollerTarget.dispatch,
  }
  const child = { parentElement: scroller }
  const box = {
    contains: (node: unknown) =>
      node === box || node === scroller || node === child,
    addEventListener: boxTarget.addEventListener,
    removeEventListener: boxTarget.removeEventListener,
    dispatch: boxTarget.dispatch,
    listeners,
  }
  scroller.parentElement = box

  vi.stubGlobal('getComputedStyle', (el: unknown) =>
    el === scroller ? { overflowX } : { overflowX: 'visible' }
  )
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    cb()
    return 1
  })
  vi.stubGlobal('window', {
    addEventListener: winTarget.addEventListener,
    removeEventListener: winTarget.removeEventListener,
    getSelection: () => ({ removeAllRanges: vi.fn() }),
  })

  return { box, scroller, child, win: winTarget }
}

describe('HorizontalDragScroll.web', () => {
  it('drags scrollLeft horizontally with mouse and suppresses trailing click', () => {
    const { box, scroller, child, win } = createFakeDom()
    const onDragStart = vi.fn()
    const onDragEnd = vi.fn()

    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(
        <HorizontalDragScroll
          snapPadding={16}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div>cards</div>
        </HorizontalDragScroll>,
        {
          createNodeMock: (el) => (el.type === 'div' ? box : null),
        }
      )
    })

    box.dispatch('pointerdown', {
      pointerType: 'mouse',
      button: 0,
      pointerId: 1,
      clientX: 200,
      clientY: 100,
      target: child,
    })

    const preventDefault = vi.fn()
    win.dispatch('pointermove', {
      pointerId: 1,
      clientX: 120,
      clientY: 102,
      preventDefault,
    })

    expect(onDragStart).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalled()
    expect(scroller.scrollLeft).toBe(80)
    expect(scroller.style.scrollSnapType).toBe('none')

    win.dispatch('pointerup', { pointerId: 1 })
    expect(onDragEnd).toHaveBeenCalledWith({
      deltaX: -80,
      scrollLeft: 80,
      maxScroll: 600,
    })

    const clickPrevent = vi.fn()
    const clickStop = vi.fn()
    box.dispatch('click', {
      preventDefault: clickPrevent,
      stopPropagation: clickStop,
    })
    expect(clickPrevent).toHaveBeenCalled()
    expect(clickStop).toHaveBeenCalled()

    act(() => {
      renderer!.unmount()
    })
    vi.unstubAllGlobals()
  })

  it('ignores touch pointers and vertical drags', () => {
    const { box, scroller, child, win } = createFakeDom()
    const onDragStart = vi.fn()

    let renderer: ReturnType<typeof create>
    act(() => {
      renderer = create(
        <HorizontalDragScroll onDragStart={onDragStart}>
          <div>cards</div>
        </HorizontalDragScroll>,
        {
          createNodeMock: (el) => (el.type === 'div' ? box : null),
        }
      )
    })

    box.dispatch('pointerdown', {
      pointerType: 'touch',
      button: 0,
      pointerId: 1,
      clientX: 200,
      clientY: 100,
      target: child,
    })
    win.dispatch('pointermove', {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn(),
    })
    expect(onDragStart).not.toHaveBeenCalled()
    expect(scroller.scrollLeft).toBe(0)

    box.dispatch('pointerdown', {
      pointerType: 'mouse',
      button: 0,
      pointerId: 2,
      clientX: 200,
      clientY: 100,
      target: child,
    })
    win.dispatch('pointermove', {
      pointerId: 2,
      clientX: 198,
      clientY: 140,
      preventDefault: vi.fn(),
    })
    win.dispatch('pointermove', {
      pointerId: 2,
      clientX: 120,
      clientY: 140,
      preventDefault: vi.fn(),
    })
    expect(onDragStart).not.toHaveBeenCalled()
    expect(scroller.scrollLeft).toBe(0)

    act(() => {
      renderer!.unmount()
    })
    vi.unstubAllGlobals()
  })
})
