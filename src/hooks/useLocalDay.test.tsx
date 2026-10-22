import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const runtime = vi.hoisted(() => ({
  zone: 'America/New_York',
  appState: new Set<(state: string) => void>(),
}))

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appState.add(listener)
      return { remove: () => runtime.appState.delete(listener) }
    },
  },
}))
// Like Hermes: `Date` keeps the old zone's offset until it's refreshed.
vi.mock('@/lib/deviceTimeZone', () => ({
  refreshLocalTimeOffset: vi.fn(() => {
    process.env.TZ = runtime.zone
  }),
}))

import useLocalDay from '@/hooks/useLocalDay'
import useToday from '@/hooks/useToday'

const originalTZ = process.env.TZ
let root: ReactTestRenderer | undefined
const seen: { day: string; today: Date }[] = []
const latest = () => seen[seen.length - 1]

function Probe() {
  seen.push({ day: useLocalDay(), today: useToday() })
  return null
}

const mount = () =>
  act(() => {
    root = create(<Probe />)
  })
const emit = (state: string) =>
  act(() => runtime.appState.forEach((listener) => listener(state)))
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const travelTo = (zone: string) => {
  runtime.zone = zone
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  seen.length = 0
  vi.useRealTimers()
  runtime.zone = 'America/New_York'
  process.env.TZ = runtime.zone
})
afterAll(() => {
  process.env.TZ = originalTZ
})

describe('useLocalDay', () => {
  it('moves to the new zone’s day when the app comes back after travel', () => {
    process.env.TZ = 'America/New_York'
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    // 2:15 AM on Oct 21 in New York; 8:15 PM on Oct 20 in Honolulu.
    vi.setSystemTime(new Date('2026-10-21T06:15:00Z'))
    mount()
    expect(latest().day).toBe('2026-10-21')
    const before = latest().today

    emit('background')
    travelTo('Pacific/Honolulu')
    emit('active')

    expect(latest().day).toBe('2026-10-20')
    expect(latest().today).not.toBe(before)
    expect(latest().today.getDate()).toBe(20)
  })

  it('keeps today on a same-day return', () => {
    process.env.TZ = 'America/New_York'
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-10-21T14:00:00Z'))
    mount()
    const renders = seen.length
    const { today } = latest()
    emit('background')
    emit('active')
    expect(seen.length).toBe(renders)
    expect(latest().today).toBe(today)
  })

  it('moves on at midnight, in the zone the device is in by then', () => {
    process.env.TZ = 'America/New_York'
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    // 11:59 PM on Oct 20 in New York.
    vi.setSystemTime(new Date('2026-10-21T03:59:00Z'))
    mount()
    expect(latest().day).toBe('2026-10-20')

    advance(2 * 60_000)
    expect(latest().day).toBe('2026-10-21')

    // Travelling with the app open: New York's midnight is 6 PM in Honolulu,
    // so the tick checks the zone first and waits for Honolulu's midnight.
    travelTo('Pacific/Honolulu')
    advance(24 * 60 * 60_000)
    expect(latest().day).toBe('2026-10-21')
    advance(6 * 60 * 60_000)
    expect(latest().day).toBe('2026-10-22')
  })

  it.each([
    // Clocks fall back: Nov 1 has 25 hours.
    ['America/New_York', '2026-11-01T03:59:00Z', '2026-10-31', 25],
    ['Europe/London', '2026-10-24T22:59:00Z', '2026-10-24', 25],
    // Clocks spring forward: Mar 8 and Oct 4 have 23 hours.
    ['America/New_York', '2026-03-08T04:59:00Z', '2026-03-07', 23],
    ['Australia/Sydney', '2026-10-03T13:59:00Z', '2026-10-03', 23],
  ] as const)(
    'moves on at each midnight around a daylight saving change in %s',
    (zone, start, eve, hours) => {
      runtime.zone = zone
      process.env.TZ = zone
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
      // 11:59 PM the evening before the change.
      vi.setSystemTime(new Date(start))
      mount()
      expect(latest().day).toBe(eve)
      const [year, month, date] = eve.split('-').map(Number)
      const next = (days: number) =>
        new Date(Date.UTC(year, month - 1, date + days))
          .toISOString()
          .slice(0, 10)

      advance(2 * 60_000)
      expect(latest().day).toBe(next(1))
      // 11:01 PM on the change day, however long it is.
      advance((hours - 1) * 60 * 60_000)
      expect(latest().day).toBe(next(1))
      expect(new Date().getHours()).toBe(23)
      advance(60 * 60_000)
      expect(latest().day).toBe(next(2))
    }
  )
})
