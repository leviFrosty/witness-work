import Module from 'node:module'
import React, { forwardRef, useContext, useImperativeHandle } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const a11y = vi.hoisted(() => ({
  launchValue: false,
  current: false,
  listeners: new Set<(value: boolean) => void>(),
  playSound: vi.fn(),
  trigger: vi.fn(),
}))

vi.mock('react-native', () => ({
  View: 'View',
  useWindowDimensions: () => ({ width: 400, height: 800 }),
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => a11y.current,
    addEventListener: (_event: string, listener: (value: boolean) => void) => {
      a11y.listeners.add(listener)
      return { remove: () => a11y.listeners.delete(listener) }
    },
  },
}))
vi.mock('react-native-reanimated', () => ({
  useReducedMotion: () => a11y.launchValue,
}))
vi.mock('@/components/ui/FullWindowOverlay', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/lib/audio', () => ({ useLazySound: () => a11y.playSound }))
import { AnimationViewContext } from '@/contexts/AnimationView'
import { ConfettiContext } from '@/contexts/Confetti'
import AnimationViewProvider, {
  CONFETTI_DELAY_MS,
} from '@/providers/AnimationViewProvider'
import ConfettiProvider from '@/providers/ConfettiProvider'

const lazyModules: Record<string, unknown> = {
  'lottie-react-native': {
    default: forwardRef(function Lottie(_props, ref) {
      useImperativeHandle(ref, () => ({ play: vi.fn(), reset: vi.fn() }))
      return 'Lottie'
    }),
  },
  '@/assets/lottie/confetti.json': {},
  '@/vendor/ConfettiSkia/react/Confetti': {
    default: forwardRef(function Confetti(_props, ref) {
      useImperativeHandle(ref, () => ({
        trigger: a11y.trigger,
        clear: vi.fn(),
      }))
      return 'SkiaConfetti'
    }),
  },
}
const loader = Module as unknown as {
  _load: (request: string, ...rest: unknown[]) => unknown
}
const originalLoad = loader._load
beforeAll(() => {
  loader._load = (request, ...rest) =>
    request in lazyModules
      ? lazyModules[request]
      : originalLoad.call(loader, request, ...rest)
})
afterAll(() => {
  loader._load = originalLoad
})

const setReduceMotion = (value: boolean) => {
  a11y.current = value
  act(() => a11y.listeners.forEach((listener) => listener(value)))
}

const flush = () => act(async () => {})

describe('celebrations under Reduce Motion', () => {
  let renderer: ReactTestRenderer | undefined

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    a11y.launchValue = false
    a11y.current = false
    a11y.listeners.clear()
    a11y.playSound.mockClear()
    a11y.trigger.mockClear()
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
    vi.useRealTimers()
  })

  const renderAnimation = () => {
    const seen: React.ContextType<typeof AnimationViewContext>[] = []
    function Probe() {
      seen.push(useContext(AnimationViewContext))
      return null
    }
    act(() => {
      renderer = create(
        <AnimationViewProvider>
          <Probe />
        </AnimationViewProvider>
      )
    })
    return () => seen.at(-1)!
  }

  const renderFireworks = () => {
    const seen: React.ContextType<typeof ConfettiContext>[] = []
    function Probe() {
      seen.push(useContext(ConfettiContext))
      return null
    }
    act(() => {
      renderer = create(
        <ConfettiProvider>
          <Probe />
        </ConfettiProvider>
      )
    })
    return () => seen.at(-1)!
  }

  const overlayShown = (type: 'Lottie' | 'SkiaConfetti') =>
    JSON.stringify(renderer!.toJSON()).includes(`"${type}"`)

  it('plays the confetti and chime when Reduce Motion is off', async () => {
    const ctx = renderAnimation()
    await flush()
    act(() => ctx().playConfetti())
    expect(overlayShown('Lottie')).toBe(true)
    act(() => {
      vi.advanceTimersByTime(CONFETTI_DELAY_MS)
    })
    expect(a11y.playSound).toHaveBeenCalledTimes(1)
  })

  it('keeps the chime but skips the confetti when Reduce Motion is on at launch', async () => {
    a11y.launchValue = true
    a11y.current = true
    const ctx = renderAnimation()
    act(() => ctx().playConfetti())
    expect(overlayShown('Lottie')).toBe(false)
    act(() => {
      vi.advanceTimersByTime(CONFETTI_DELAY_MS)
    })
    expect(a11y.playSound).toHaveBeenCalledTimes(1)
  })

  it('follows Reduce Motion as it is toggled while the app runs', async () => {
    const ctx = renderAnimation()
    await flush()
    setReduceMotion(true)
    act(() => ctx().playConfetti())
    expect(overlayShown('Lottie')).toBe(false)

    setReduceMotion(false)
    act(() => ctx().playConfetti())
    expect(overlayShown('Lottie')).toBe(true)
  })

  it('fires fireworks when Reduce Motion is off', async () => {
    const ctx = renderFireworks()
    await flush()
    act(() => {
      ctx().fire({ spots: [{ x: 0.5, y: 0.5 }] })
      vi.runAllTimers()
    })
    expect(overlayShown('SkiaConfetti')).toBe(true)
    expect(a11y.trigger).toHaveBeenCalledTimes(1)
  })

  it('skips fireworks and single bursts when Reduce Motion is on', async () => {
    const ctx = renderFireworks()
    await flush()
    setReduceMotion(true)
    act(() => {
      ctx().fire()
      ctx().triggerBurst()
      vi.runAllTimers()
    })
    expect(overlayShown('SkiaConfetti')).toBe(false)
    expect(a11y.trigger).not.toHaveBeenCalled()
  })
})
