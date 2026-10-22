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
  appState: new Set<(state: string) => void>(),
  currentState: 'active',
  setActive: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    get currentState() {
      return runtime.currentState
    },
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appState.add(listener)
      return { remove: () => runtime.appState.delete(listener) }
    },
  },
}))

vi.mock('react-native-reanimated', () => ({
  SensorType: { GRAVITY: 1 },
  clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
  useAnimatedSensor: () => ({ sensor: { value: { x: 0, y: 0, z: 0 } } }),
  useFrameCallback: () => ({ setActive: runtime.setActive }),
  useSharedValue: <T,>(value: T) => ({ value }),
}))

import useWelcomeMotion, {
  runsInAppState,
} from '@/features/onboarding/hooks/useWelcomeMotion'

let root: ReactTestRenderer | undefined

function Probe({ running }: { running: boolean }) {
  useWelcomeMotion(running)
  return null
}

const emit = (state: string) =>
  act(() => runtime.appState.forEach((listener) => listener(state)))
const lastActive = () => runtime.setActive.mock.calls.at(-1)?.[0]

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})
beforeEach(() => {
  runtime.currentState = 'active'
  runtime.setActive.mockClear()
})
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
})

describe('useWelcomeMotion', () => {
  it('runs frames except in the background', () => {
    expect(runsInAppState('active')).toBe(true)
    expect(runsInAppState('inactive')).toBe(true)
    expect(runsInAppState('background')).toBe(false)
  })

  it('stops the frame clock while the app is in the background', () => {
    act(() => {
      root = create(<Probe running />)
    })
    expect(lastActive()).toBe(true)
    emit('background')
    expect(lastActive()).toBe(false)
    emit('active')
    expect(lastActive()).toBe(true)
  })

  it('stays stopped when not running, whatever the app state', () => {
    act(() => {
      root = create(<Probe running={false} />)
    })
    expect(lastActive()).toBe(false)
    emit('background')
    emit('active')
    expect(lastActive()).toBe(false)
  })

  it('starts stopped when mounted in the background', () => {
    runtime.currentState = 'background'
    act(() => {
      root = create(<Probe running />)
    })
    expect(lastActive()).toBe(false)
    expect(runtime.appState.size).toBe(1)
  })
})
