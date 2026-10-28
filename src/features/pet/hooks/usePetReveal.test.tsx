import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  return { reduceMotion: false, announce: vi.fn(), haptics: [] as string[] }
})

vi.mock('react-native', () => ({
  AccessibilityInfo: { announceForAccessibility: runtime.announce },
}))
vi.mock('react-native-reanimated', () => ({
  useReducedMotion: () => runtime.reduceMotion,
}))
vi.mock('@/lib/haptics', () => ({
  default: {
    light: () => (runtime.haptics.push('light'), Promise.resolve()),
    success: () => (runtime.haptics.push('success'), Promise.resolve()),
  },
}))
vi.mock('@/features/pet/lib/roomLabels', () => ({
  gainedText: (gain: number) => (gain > 0 ? `Earned ${gain} coins` : null),
}))
vi.mock('@/stores/rewardStack', () => ({
  rewardStackPlays: () => false,
  startReward: () => null,
  useRewardStack: (select: (state: { run: null }) => unknown) =>
    select({ run: null }),
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('react-native-mmkv', () => ({ MMKV: class {} }))

import usePetReveal, { type PetReveal } from '@/features/pet/hooks/usePetReveal'
import { NO_EARNINGS } from '@/features/pet/lib/currency'
import type { PetShown } from '@/features/pet/lib/reveal'
import { usePetSeen } from '@/features/pet/stores/petSeen'

let renderer: ReactTestRenderer | undefined
let frames: PetReveal[] = []

function mount(props: {
  now: PetShown
  visible: boolean
  adoptedToday?: boolean
  flights?: boolean
}) {
  function Harness(p: typeof props) {
    frames.push(
      usePetReveal({
        pet: 'pip',
        adoptedToday: false,
        earned: NO_EARNINGS,
        ...p,
      })
    )
    return null
  }
  act(() => {
    if (renderer) renderer.update(<Harness {...props} />)
    else renderer = create(<Harness {...props} />)
  })
}

const latest = () => frames.at(-1)!

beforeEach(() => {
  vi.useFakeTimers()
  frames = []
  runtime.reduceMotion = false
  runtime.haptics = []
  runtime.announce.mockClear()
  usePetSeen.setState({
    seen: { pet: 'pip', coins: 42, hearts: 3.5 },
  })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

const NOW = { coins: 62, hearts: 5 }

describe('usePetReveal', () => {
  it('shows what was last seen until the surface is in view', () => {
    mount({ now: NOW, visible: false })
    expect(latest().shown).toEqual({ coins: 42, hearts: 3.5 })
    act(() => void vi.advanceTimersByTime(5000))
    expect(usePetSeen.getState().seen?.coins).toBe(42)
  })

  it('plays hearts, then coins, once', () => {
    mount({ now: NOW, visible: false })
    mount({ now: NOW, visible: true, flights: true })
    // Marked seen at once, so it never plays twice, but still shows the old.
    expect(usePetSeen.getState().seen).toMatchObject(NOW)
    expect(latest().shown).toEqual({ coins: 42, hearts: 3.5 })
    expect(runtime.announce).toHaveBeenCalledWith('Earned 20 coins')

    act(() => void vi.advanceTimersByTime(280))
    expect(latest().shown.hearts).toBe(4)
    expect(latest().heart).toMatchObject({ index: 3, up: true })
    act(() => void vi.advanceTimersByTime(560))
    expect(latest().shown.hearts).toBe(5)
    expect(latest().shown.coins).toBe(42)

    act(() => void vi.advanceTimersByTime(200))
    expect(latest().coins).toMatchObject({ delta: 20, tier: 'big' })
    // The count waits for the first coin to land.
    expect(latest().shown.coins).toBe(42)
    act(() => void vi.advanceTimersByTime(5000))
    expect(latest()).toEqual({ shown: NOW, heart: null, coins: null })
    const counts = frames.map((frame) => frame.shown.coins)
    expect(counts.filter((value, i) => value < counts[i - 1])).toEqual([])
    expect(runtime.haptics).toEqual(['success'])
  })

  it('counts down what was spent, quietly', () => {
    usePetSeen.setState({
      seen: { pet: 'pip', coins: 30, hearts: 5 },
    })
    mount({ now: { coins: 18, hearts: 5 }, visible: true })
    act(() => void vi.advanceTimersByTime(200))
    expect(latest().coins).toMatchObject({ delta: -12, tier: 'loss' })
    act(() => void vi.advanceTimersByTime(2000))
    expect(latest().shown.coins).toBe(18)
    expect(runtime.haptics).toEqual([])
    expect(runtime.announce).not.toHaveBeenCalled()
  })

  it('changes at once with Reduce Motion', () => {
    runtime.reduceMotion = true
    mount({ now: NOW, visible: true })
    expect(latest().shown).toEqual(NOW)
    expect(usePetSeen.getState().seen).toMatchObject(NOW)
    expect(runtime.announce).toHaveBeenCalled()
  })

  it('starts a pet it never showed from now, or from nothing on its first day', () => {
    usePetSeen.setState({ seen: null })
    mount({ now: NOW, visible: true })
    expect(latest().shown).toEqual(NOW)
    expect(usePetSeen.getState().seen).toMatchObject({ pet: 'pip', ...NOW })

    act(() => renderer?.unmount())
    renderer = undefined
    usePetSeen.setState({ seen: null })
    mount({
      now: { coins: 8, hearts: 4 },
      visible: true,
      adoptedToday: true,
    })
    act(() => void vi.advanceTimersByTime(5000))
    expect(frames.some((frame) => frame.shown.coins === 0)).toBe(true)
    expect(latest().shown).toEqual({ coins: 8, hearts: 4 })
  })
})
