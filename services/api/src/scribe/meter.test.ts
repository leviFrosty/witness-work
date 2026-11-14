import { describe, expect, it } from 'vitest'
import { DEFAULT_SCRIBE_LIMITS, type ScribeLimits } from './config'
import {
  applyCharge,
  computeUnits,
  decideAdmission,
  emptyWindows,
  percentUsed,
  planWindows,
  retryAfterUntil,
  stepUsage,
  usageSnapshot,
  type WindowStates,
} from './meter'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 9, 21, 14)
const LENGTHS = { session: 5 * HOUR, weekly: 7 * DAY, monthly: 30 * DAY }
const WEIGHTS = DEFAULT_SCRIBE_LIMITS.weights

const limits = (overrides: Partial<ScribeLimits> = {}): ScribeLimits => ({
  ...DEFAULT_SCRIBE_LIMITS,
  ...overrides,
})

/** A free plan with one limit for every week, the first included. */
const freeOf = (weekly: number) => ({
  free: { ...DEFAULT_SCRIBE_LIMITS.free, weekly, welcome: weekly },
})

const charged = (units: number, at = NOW, windows: WindowStates = emptyWindows()) =>
  applyCharge(windows, units, at, LENGTHS)

describe('computeUnits', () => {
  it('weighs uncached input, cached input, and output with the defaults', () => {
    // The protocol's quick-edit step 0 with nothing written: 3,775 + 230 + 1,500.
    expect(
      computeUnits(
        { inputTokens: 6_075, cachedInputTokens: 2_300, cacheWriteTokens: 0, outputTokens: 300 },
        WEIGHTS
      )
    ).toBe(5_505)
    // Step 1: 450 + 607.5 + 1,500, rounded up.
    expect(
      computeUnits(
        { inputTokens: 6_525, cachedInputTokens: 6_075, cacheWriteTokens: 0, outputTokens: 300 },
        WEIGHTS
      )
    ).toBe(2_558)
  })

  it('charges cache writes at 1.25× input, out of the uncached input', () => {
    // Measured cold step 0 (d1): 4,808 in, 4,805 written, 78 out.
    // 3 + 1.25 × 4,805 + 5 × 78 = 6,399.25 → 6,400; OpenRouter billed $0.000639925.
    expect(
      computeUnits(
        { inputTokens: 4_808, cachedInputTokens: 0, cacheWriteTokens: 4_805, outputTokens: 78 },
        WEIGHTS
      )
    ).toBe(6_400)
    // Measured warm-prefix step 0 of another conversation (d2): 4,869 in, 3,860
    // read, 1,006 written, 79 out. 3 + 1,257.5 + 386 + 395 = 2,041.5 → 2,042.
    expect(
      computeUnits(
        { inputTokens: 4_869, cachedInputTokens: 3_860, cacheWriteTokens: 1_006, outputTokens: 79 },
        WEIGHTS
      )
    ).toBe(2_042)
  })

  it('never counts more writes than uncached input', () => {
    expect(
      computeUnits(
        { inputTokens: 1_000, cachedInputTokens: 600, cacheWriteTokens: 5_000, outputTokens: 0 },
        WEIGHTS
      )
    ).toBe(60 + 500)
    expect(
      computeUnits(
        { inputTokens: 100, cachedInputTokens: 200, cacheWriteTokens: 50, outputTokens: 0 },
        WEIGHTS
      )
    ).toBe(20)
    expect(
      computeUnits(
        { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: -50, outputTokens: 0 },
        WEIGHTS
      )
    ).toBe(100)
  })

  it('uses custom weights', () => {
    expect(
      computeUnits(
        { inputTokens: 1_000, cachedInputTokens: 500, cacheWriteTokens: 200, outputTokens: 10 },
        { input: 2, cachedInput: 0.5, cacheWrite: 3, output: 10 }
      )
    ).toBe(600 + 250 + 600 + 100)
    // A cacheWrite weight equal to input charges writes as uncached input, as before.
    expect(
      computeUnits(
        { inputTokens: 1_000, cachedInputTokens: 500, cacheWriteTokens: 200, outputTokens: 10 },
        { ...WEIGHTS, cacheWrite: 1 }
      )
    ).toBe(500 + 50 + 50)
  })

  it('never adds a unit for float noise and never goes negative', () => {
    expect(
      computeUnits(
        { inputTokens: 2_300, cachedInputTokens: 2_300, cacheWriteTokens: 0, outputTokens: 0 },
        WEIGHTS
      )
    ).toBe(230)
    expect(
      computeUnits(
        { inputTokens: 10, cachedInputTokens: 50, cacheWriteTokens: 0, outputTokens: -5 },
        WEIGHTS
      )
    ).toBe(5)
    expect(
      computeUnits(
        { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
        WEIGHTS
      )
    ).toBe(0)
  })

  it('carries the units and the writes on the step usage', () => {
    expect(
      stepUsage(
        {
          inputTokens: 1_100,
          cachedInputTokens: 0,
          cacheWriteTokens: 1_000,
          outputTokens: 10,
          reasoningTokens: 4,
        },
        WEIGHTS
      )
    ).toEqual({
      inputTokens: 1_100,
      cachedInputTokens: 0,
      cacheWriteTokens: 1_000,
      outputTokens: 10,
      reasoningTokens: 4,
      units: 100 + 1_250 + 50,
    })
  })
})

describe('windows', () => {
  it('starts every window on the first charge and accrues to all three', () => {
    const windows = charged(100)
    expect(windows).toEqual({
      session: { startedAt: NOW, used: 100 },
      weekly: { startedAt: NOW, used: 100, welcome: true },
      monthly: { startedAt: NOW, used: 100 },
    })
    const later = charged(50, NOW + HOUR, windows)
    expect(later.session).toEqual({ startedAt: NOW, used: 150 })
  })

  it('starts a fresh window once one has ended', () => {
    const windows = charged(100)
    const after = charged(30, NOW + 5 * HOUR, windows)
    expect(after.session).toEqual({ startedAt: NOW + 5 * HOUR, used: 30 })
    expect(after.weekly).toEqual({ startedAt: NOW, used: 130, welcome: true })
  })

  it('marks only an account’s first weekly window as its welcome window', () => {
    const first = charged(100)
    expect(first.weekly.welcome).toBe(true)
    const second = charged(40, NOW + 7 * DAY, first)
    expect(second.weekly).toEqual({ startedAt: NOW + 7 * DAY, used: 40 })
  })

  it('starts nothing for a zero charge', () => {
    const windows = emptyWindows()
    expect(charged(0, NOW, windows)).toBe(windows)
  })

  it('shows the plan’s windows, shortest first', () => {
    expect(planWindows('supporter')).toEqual(['session', 'weekly'])
    expect(planWindows('free')).toEqual(['weekly'])
  })

  it('switches the windows shown when the plan changes, keeping the totals', () => {
    const windows = charged(1_000)
    const asFree = usageSnapshot({
      plan: 'free',
      supporterCheckFailed: false,
      windows,
      limits: limits(),
      now: NOW,
    })
    const asSupporter = usageSnapshot({
      plan: 'supporter',
      supporterCheckFailed: false,
      windows,
      limits: limits(),
      now: NOW,
    })
    expect(asFree.windows.map((w) => [w.id, w.units.used])).toEqual([
      ['weekly', 1_000],
      ['monthly', 1_000],
    ])
    expect(asSupporter.windows.map((w) => [w.id, w.units.used])).toEqual([
      ['session', 1_000],
      ['weekly', 1_000],
    ])
  })
})

describe('percentUsed', () => {
  it.each([
    [0, 100, 0],
    [1, 1_000_000, 1],
    [999, 1_000, 99],
    [1_000, 1_000, 100],
    [5_000, 1_000, 100],
    [10, -1, 0],
    [0, 0, 100],
  ])('%i of %i → %i', (used, limit, percent) => {
    expect(percentUsed(used, limit)).toBe(percent)
  })
})

describe('usageSnapshot', () => {
  it('reports a full window as limited until it resets', () => {
    const windows = charged(25_000, NOW + 7 * DAY, charged(10))
    const snapshot = usageSnapshot({
      plan: 'free',
      supporterCheckFailed: true,
      windows,
      limits: limits(),
      now: NOW + 8 * DAY,
    })
    const week = {
      percentUsed: 100,
      resetsAt: NOW + 14 * DAY,
      units: { used: 25_000, limit: 25_000 },
    }
    expect(snapshot).toEqual({
      plan: 'free',
      supporterCheckFailed: true,
      // Apps before 1.47.0 read the same week under `monthly`.
      windows: [
        { id: 'weekly', ...week },
        { id: 'monthly', ...week },
      ],
      limited: true,
      resetsAt: NOW + 14 * DAY,
      asOf: NOW + 8 * DAY,
    })
  })

  it('gives a free account the welcome limit in its first week only', () => {
    const free = (windows: WindowStates, now: number) =>
      usageSnapshot({ plan: 'free', supporterCheckFailed: false, windows, limits: limits(), now })
    expect(free(emptyWindows(), NOW).windows[0].units).toEqual({ used: 0, limit: 150_000 })
    const first = charged(30_000)
    expect(free(first, NOW).windows[0]).toMatchObject({
      percentUsed: 20,
      units: { used: 30_000, limit: 150_000 },
    })
    expect(free(first, NOW).limited).toBe(false)
    const second = charged(30_000, NOW + 7 * DAY, first)
    expect(free(second, NOW + 7 * DAY).windows[0].units).toEqual({ used: 30_000, limit: 25_000 })
    expect(free(second, NOW + 7 * DAY).limited).toBe(true)
  })

  it('never gives a Supporter the welcome limit', () => {
    const snapshot = usageSnapshot({
      plan: 'supporter',
      supporterCheckFailed: false,
      windows: charged(10),
      limits: limits(),
      now: NOW,
    })
    expect(snapshot.windows.map((w) => w.units.limit)).toEqual([200_000, 500_000])
  })

  it('keeps the weekly limit when the welcome limit is smaller', () => {
    const snapshot = usageSnapshot({
      plan: 'free',
      supporterCheckFailed: false,
      windows: charged(10),
      limits: limits({ free: { weekly: 25_000, welcome: 0, graceUnits: 0 } }),
      now: NOW,
    })
    expect(snapshot.windows[0].units.limit).toBe(25_000)
  })

  it('takes the latest reset among full windows', () => {
    const windows = charged(500_000)
    const snapshot = usageSnapshot({
      plan: 'supporter',
      supporterCheckFailed: false,
      windows,
      limits: limits(),
      now: NOW,
    })
    expect(snapshot.limited).toBe(true)
    expect(snapshot.resetsAt).toBe(NOW + 7 * DAY)
  })

  it('shows an ended window as empty with no reset time', () => {
    const snapshot = usageSnapshot({
      plan: 'supporter',
      supporterCheckFailed: false,
      windows: charged(500),
      limits: limits(),
      now: NOW + 6 * HOUR,
    })
    expect(snapshot.windows[0]).toEqual({
      id: 'session',
      percentUsed: 0,
      resetsAt: null,
      units: { used: 0, limit: 200_000 },
    })
    expect(snapshot.limited).toBe(false)
    expect(snapshot.resetsAt).toBeNull()
  })

  it('never limits an unlimited window', () => {
    const snapshot = usageSnapshot({
      plan: 'free',
      supporterCheckFailed: false,
      windows: charged(10_000_000),
      limits: limits(freeOf(-1)),
      now: NOW,
    })
    expect(snapshot.limited).toBe(false)
    expect(snapshot.windows[0].percentUsed).toBe(0)
  })
})

describe('decideAdmission', () => {
  const capped = limits(freeOf(1_000))
  const admit = (
    windows: WindowStates,
    fields: { step?: number; turnOpenedAt?: number | null; now?: number } = {}
  ) =>
    decideAdmission({
      plan: 'free',
      windows,
      limits: capped,
      now: fields.now ?? NOW,
      step: fields.step ?? 0,
      turnOpenedAt: fields.turnOpenedAt ?? null,
    })

  it('admits while every window is under its limit', () => {
    expect(admit(charged(999))).toEqual({ admitted: true, grace: false })
    expect(admit(charged(1_000))).toEqual({ admitted: false })
  })

  it('admits a later step of an open turn within grace', () => {
    const windows = charged(1_200)
    expect(admit(windows, { step: 1, turnOpenedAt: NOW - 60_000 })).toEqual({
      admitted: true,
      grace: true,
    })
  })

  it('refuses step 0 even inside grace', () => {
    expect(admit(charged(1_200), { step: 0, turnOpenedAt: NOW })).toEqual({ admitted: false })
  })

  it('refuses past graceUnits', () => {
    expect(admit(charged(1_000 + 15_000), { step: 2, turnOpenedAt: NOW })).toEqual({
      admitted: false,
    })
    expect(admit(charged(1_000 + 14_999), { step: 2, turnOpenedAt: NOW })).toEqual({
      admitted: true,
      grace: true,
    })
  })

  it('gives a Supporter the larger turn grace', () => {
    const supporter = (used: number) =>
      decideAdmission({
        plan: 'supporter',
        windows: charged(used),
        limits: limits(),
        now: NOW,
        step: 1,
        turnOpenedAt: NOW,
      })
    expect(supporter(200_000 + 49_999)).toEqual({ admitted: true, grace: true })
    expect(supporter(200_000 + 50_000)).toEqual({ admitted: false })
  })

  it('refuses after turnGraceMinutes', () => {
    const windows = charged(1_200)
    expect(admit(windows, { step: 1, turnOpenedAt: NOW - 30 * 60_000 }).admitted).toBe(true)
    expect(admit(windows, { step: 1, turnOpenedAt: NOW - 30 * 60_000 - 1 }).admitted).toBe(false)
    expect(admit(windows, { step: 1, turnOpenedAt: null }).admitted).toBe(false)
  })

  it('admits again once the full window has ended', () => {
    expect(admit(charged(5_000), { now: NOW + 7 * DAY })).toEqual({
      admitted: true,
      grace: false,
    })
  })

  it('needs every supporter window under its limit', () => {
    const decision = decideAdmission({
      plan: 'supporter',
      windows: { ...charged(10), weekly: { startedAt: NOW, used: 500_000 } },
      limits: limits(),
      now: NOW,
      step: 0,
      turnOpenedAt: null,
    })
    expect(decision).toEqual({ admitted: false })
  })

  it('charges an admitted overshoot in full', () => {
    const windows = charged(999)
    expect(admit(windows).admitted).toBe(true)
    expect(charged(40_000, NOW, windows).weekly.used).toBe(40_999)
  })
})

describe('retryAfterUntil', () => {
  it('rounds up to whole seconds, at least 1', () => {
    expect(retryAfterUntil(NOW + 1_500, NOW)).toBe(2)
    expect(retryAfterUntil(NOW - 10, NOW)).toBe(1)
    expect(retryAfterUntil(null, NOW)).toBeUndefined()
  })
})
