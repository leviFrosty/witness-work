import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  sounds: [] as string[],
  haptics: [] as string[],
  events: [] as [string, unknown][],
  prefs: { rewardAnimations: true },
}))

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isScreenReaderEnabled: () => Promise.resolve(false),
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove() {} }),
    announceForAccessibility: vi.fn(),
  },
}))
vi.mock('@/lib/audio', () => ({
  playRewardSound: (role: string) => runtime.sounds.push(role),
  prepareRewardSounds: () => {},
  releaseRewardSounds: () => {},
  semitones: (n: number) => 2 ** (n / 12),
}))
vi.mock('@/lib/haptics', () => ({
  default: new Proxy(
    {},
    {
      get: (_, level: string) => () => {
        runtime.haptics.push(level)
        return Promise.resolve()
      },
    }
  ),
}))
vi.mock('@/lib/analytics', () => ({
  analytics: {
    capture: (event: string, props: unknown) =>
      runtime.events.push([event, props]),
  },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => runtime.prefs },
}))

import {
  claimRewardSlot,
  resetRewardStack,
  skipReward,
  startReward,
  useRewardStack,
  type RewardLine,
  type RewardRunInput,
} from '@/stores/rewardStack'

const line = (amount: number, patch: Partial<RewardLine> = {}): RewardLine => ({
  amount,
  label: `+${amount}`,
  tone: 'base',
  ...patch,
})

const input = (
  lines: RewardLine[],
  from = 40,
  patch: Partial<RewardRunInput> = {}
): RewardRunInput => ({
  slot: 'toast',
  lines,
  count: { from, to: from + lines.reduce((sum, l) => sum + l.amount, 0) },
  icon: () => null,
  announcement: 'Earned',
  ...patch,
})

const run = () => useRewardStack.getState().run
const advance = (ms: number) => vi.advanceTimersByTime(ms)

describe('the reward stack', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    runtime.sounds = []
    runtime.haptics = []
    runtime.events = []
    runtime.prefs.rewardAnimations = true
  })
  afterEach(() => {
    resetRewardStack()
    vi.useRealTimers()
  })

  it('stomps each line in, slams the total, then counts the wallet up', () => {
    const id = startReward(input([line(1), line(1, { tone: 'bonus' })]))
    expect(id).not.toBeNull()
    advance(0)
    expect(run()).toMatchObject({ played: 1, phase: 'play', soft: false })
    advance(200)
    expect(runtime.sounds).toEqual(['hit'])
    advance(400)
    expect(run()?.played).toBe(2)
    advance(1200)
    expect(runtime.sounds).toContain('slam')
    expect(runtime.haptics).toContain('success')
    advance(700)
    expect(run()?.phase).toBe('count')
    advance(2000)
    expect(run()).toBeNull()
    expect(runtime.sounds.filter((s) => s === 'tick')).toHaveLength(2)
  })

  it('lets a single small line rise without a hit, a slam or a skip catcher', () => {
    startReward(input([line(1)]))
    expect(run()?.soft).toBe(true)
    advance(3000)
    expect(runtime.sounds).toEqual(['tick', 'tick'])
    expect(runtime.haptics).toEqual([])
    expect(run()).toBeNull()
  })

  it('adds a save made while it stomps to the same combo', () => {
    const first = startReward(input([line(1), line(1)]))
    advance(100)
    const second = startReward(input([line(1)], 42))
    expect(second).toBe(first)
    expect(run()?.lines).toHaveLength(3)
    expect(run()?.count).toEqual({ from: 40, to: 43 })
    advance(5000)
    expect(run()).toBeNull()
  })

  it('holds a milestone for the celebration, plays it there, and gives it back', () => {
    const leave = vi.fn()
    startReward(
      input([line(1), line(10, { tone: 'milestone', celebration: true })])
    )
    advance(600)
    expect(run()).toMatchObject({ played: 1, phase: 'hold', slot: 'toast' })
    const release = claimRewardSlot(leave)
    expect(run()).toMatchObject({ slot: 'celebration', phase: 'hold' })
    advance(1200)
    expect(run()).toMatchObject({ slot: 'celebration', played: 2 })
    advance(200)
    expect(runtime.sounds).toContain('heavy')
    expect(runtime.haptics).toContain('heavy')
    advance(1500)

    expect(leave).toHaveBeenCalledTimes(1)
    expect(run()?.slot).toBe('toast')
    release()
    advance(2000)
    expect(run()).toBeNull()
  })

  it('plays a held line where it is when no celebration opens', () => {
    startReward(
      input([line(1), line(10, { tone: 'milestone', celebration: true })])
    )
    advance(600)
    expect(run()?.phase).toBe('hold')
    advance(3300)
    expect(run()).toMatchObject({ played: 2, slot: 'toast' })
  })

  it('skips the whole run on a tap, closing the celebration with it', () => {
    const leave = vi.fn()
    startReward(
      input([line(1), line(10, { tone: 'milestone', celebration: true })])
    )
    advance(600)
    claimRewardSlot(leave)
    skipReward()
    expect(run()).toBeNull()
    expect(leave).toHaveBeenCalledTimes(1)
    expect(runtime.events[0]).toEqual([
      'reward_stack_skipped',
      { slot: 'celebration', phase: 'hold', lines: 2, played: 1 },
    ])
    advance(5000)
    expect(runtime.sounds).toEqual(['hit'])
  })

  it("doesn't play with reward animations off", () => {
    runtime.prefs.rewardAnimations = false
    expect(startReward(input([line(1), line(1)]))).toBeNull()
    expect(run()).toBeNull()
  })
})
