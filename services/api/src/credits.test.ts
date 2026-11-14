import { describe, expect, it } from 'vitest'
import {
  computeCommit,
  computeCreditsSnapshot,
  computeImportUsage,
  computeKickoffCredits,
  decideCredit,
  normalizeImportWindow,
  refinementUsage,
  type Allowance,
  type CreditDecision,
  type CreditState,
  type HashRecord,
  type ImportWindow,
} from './credits'

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_MS = 30 * DAY_MS
const JULY_1 = Date.UTC(2026, 6, 1)
const DEFAULT_IMPORTS = 5
const DEFAULT_REFINEMENTS = 5

class MeterStore {
  window: ImportWindow = { count: 0, startedAt: null }
  records = new Map<string, HashRecord>()

  state(hash: string): CreditState {
    return { window: this.window, record: this.records.get(hash) ?? null }
  }

  apply(hash: string, next: CreditState): void {
    this.window = next.window
    if (next.record) this.records.set(hash, next.record)
  }
}

interface MeterOptions {
  importLimit?: Allowance
  refinementLimit?: Allowance
  isRefinement?: boolean
  isEmpty?: boolean
  emptyCount?: number
  emptyLimit?: number
}

const decide = (
  store: MeterStore,
  hash: string,
  now: number,
  options: MeterOptions = {}
): CreditDecision =>
  decideCredit({
    state: store.state(hash),
    isRefinement: options.isRefinement ?? false,
    importLimit: options.importLimit ?? DEFAULT_IMPORTS,
    refinementLimit: options.refinementLimit ?? DEFAULT_REFINEMENTS,
    now,
    windowDurationMs: WINDOW_MS,
  })

const settle = (
  store: MeterStore,
  hash: string,
  now: number,
  options: MeterOptions = {}
) => {
  const decision = decide(store, hash, now, options)
  if (!decision.allowed) return { decision, commit: null }
  const commit = computeCommit({
    decision,
    state: store.state(hash),
    importLimit: options.importLimit ?? DEFAULT_IMPORTS,
    now,
    windowDurationMs: WINDOW_MS,
    empty: options.isEmpty
      ? {
          isEmpty: true,
          countInWindow: options.emptyCount ?? 0,
          limit: options.emptyLimit ?? 5,
        }
      : undefined,
  })
  store.apply(hash, commit.state)
  return { decision, commit }
}

const snapshot = (
  store: MeterStore,
  hash: string,
  now: number,
  options: MeterOptions & { isSupporter?: boolean } = {}
) =>
  computeCreditsSnapshot({
    state: store.state(hash),
    isSupporter: options.isSupporter ?? false,
    importLimit: options.importLimit ?? DEFAULT_IMPORTS,
    refinementLimit: options.refinementLimit ?? DEFAULT_REFINEMENTS,
    now,
    windowDurationMs: WINDOW_MS,
  })

describe('fixed import window', () => {
  it('expires at the exact reset boundary, but not one millisecond before', () => {
    const window = { count: 3, startedAt: JULY_1 }
    const resetsAt = JULY_1 + WINDOW_MS

    expect(normalizeImportWindow(window, resetsAt - 1, WINDOW_MS)).toEqual(window)
    expect(normalizeImportWindow(window, resetsAt, WINDOW_MS)).toEqual({
      count: 0,
      startedAt: null,
    })
  })

  it('anchors only when the first brand-new import succeeds', () => {
    const store = new MeterStore()
    const decision = decide(store, 'new', JULY_1)
    expect(decision.allowed).toBe(true)
    expect(store.window).toEqual({ count: 0, startedAt: null })
    expect(
      computeKickoffCredits({
        decision,
        state: store.state('new'),
        isSupporter: false,
        importLimit: 5,
        refinementLimit: 5,
        now: JULY_1,
        windowDurationMs: WINDOW_MS,
      })
    ).toEqual({
      remaining: 4,
      limit: 5,
      resetsAt: null,
      isSupporter: false,
      refinements: { remaining: 5, limit: 5 },
    })

    const commit = computeCommit({
      decision,
      state: store.state('new'),
      importLimit: 5,
      now: JULY_1 + 1_000,
      windowDurationMs: WINDOW_MS,
    })
    store.apply('new', commit.state)
    expect(store.window).toEqual({ count: 1, startedAt: JULY_1 + 1_000 })
    expect(snapshot(store, 'new', JULY_1 + 1_000)).toEqual({
      remaining: 4,
      limit: 5,
      resetsAt: new Date(JULY_1 + 1_000 + WINDOW_MS).toISOString(),
      isSupporter: false,
      refinements: { remaining: 5, limit: 5 },
    })
  })

  it('allows five finite imports, clamps bounded overage, then denies new hashes', () => {
    const store = new MeterStore()
    const remainings: (number | null)[] = []
    for (let i = 0; i < 5; i++) {
      const result = settle(store, `hash-${i}`, JULY_1 + i)
      expect(result.decision.allowed).toBe(true)
      remainings.push(snapshot(store, `hash-${i}`, JULY_1 + i).remaining)
    }
    expect(remainings).toEqual([4, 3, 2, 1, 0])
    expect(decide(store, 'sixth', JULY_1 + 10).reason).toBe('limit_reached')

    const staleA = decideCredit({
      state: { window: { count: 4, startedAt: JULY_1 }, record: null },
      isRefinement: false,
      importLimit: 5,
      refinementLimit: 5,
      now: JULY_1 + 10,
      windowDurationMs: WINDOW_MS,
    })
    const staleB = { ...staleA }
    const concurrent = new MeterStore()
    concurrent.window = { count: 4, startedAt: JULY_1 }
    for (const [hash, decision] of [
      ['a', staleA],
      ['b', staleB],
    ] as const) {
      const commit = computeCommit({
        decision,
        state: concurrent.state(hash),
        importLimit: 5,
        now: JULY_1 + 20,
        windowDurationMs: WINDOW_MS,
      })
      concurrent.apply(hash, commit.state)
    }
    expect(concurrent.window.count).toBe(6)
    expect(snapshot(concurrent, 'b', JULY_1 + 20).remaining).toBe(0)
  })

  it('lazily rolls an expired window on the next successful charge', () => {
    const store = new MeterStore()
    settle(store, 'old', JULY_1)
    settle(store, 'old-2', JULY_1 + 1)
    const afterExpiry = JULY_1 + WINDOW_MS

    expect(decide(store, 'next', afterExpiry).remaining).toBe(4)
    expect(store.window).toEqual({ count: 2, startedAt: JULY_1 })

    const { commit } = settle(store, 'next', afterExpiry)
    expect(commit?.rollover).toEqual({
      previousCount: 2,
      previousResetsAt: new Date(afterExpiry).toISOString(),
      newResetsAt: new Date(afterExpiry + WINDOW_MS).toISOString(),
    })
    expect(store.window).toEqual({ count: 1, startedAt: afterExpiry })
  })

  it('keeps a charged hash replayable for free across later windows', () => {
    const store = new MeterStore()
    settle(store, 'known', JULY_1)
    const later = JULY_1 + 2 * WINDOW_MS
    const replay = settle(store, 'known', later)
    expect(replay.decision.allowed).toBe(true)
    expect(replay.decision.isNewHash).toBe(false)
    expect(store.window).toEqual({ count: 1, startedAt: JULY_1 })
    expect(snapshot(store, 'known', later).resetsAt).toBeNull()
  })

  it('does not anchor or charge a failed/cancelled run because it is never committed', () => {
    const store = new MeterStore()
    expect(decide(store, 'failed', JULY_1).allowed).toBe(true)
    expect(decide(store, 'cancelled', JULY_1 + 1).allowed).toBe(true)
    expect(store.window).toEqual({ count: 0, startedAt: null })
    expect(store.records.size).toBe(0)
  })
})

describe('effective -1/0/N allowances', () => {
  it('blocks a brand-new hash at zero but permits a known replay', () => {
    const store = new MeterStore()
    settle(store, 'known', JULY_1)
    expect(decide(store, 'new', JULY_1 + 1, { importLimit: 0 })).toMatchObject({
      allowed: false,
      reason: 'limit_reached',
      remaining: 0,
    })
    expect(decide(store, 'known', JULY_1 + 1, { importLimit: 0 }).allowed).toBe(
      true
    )
    expect(snapshot(store, 'known', JULY_1 + 1, { importLimit: 0 })).toMatchObject({
      remaining: 0,
      limit: 0,
      resetsAt: null,
    })
  })

  it('records unlimited imports without consuming or anchoring window usage', () => {
    const store = new MeterStore()
    for (let i = 0; i < 12; i++) {
      expect(settle(store, `hash-${i}`, JULY_1 + i, { importLimit: -1 }).decision.allowed).toBe(
        true
      )
    }
    expect(store.window).toEqual({ count: 0, startedAt: null })
    expect(store.records.size).toBe(12)
    expect(snapshot(store, 'hash-0', JULY_1 + 20, { importLimit: -1 })).toMatchObject({
      remaining: null,
      limit: null,
      resetsAt: null,
    })
  })

  it('selects a changed tier limit against the existing shared window', () => {
    const store = new MeterStore()
    settle(store, 'a', JULY_1, { importLimit: 5 })
    settle(store, 'b', JULY_1 + 1, { importLimit: 5 })

    expect(decide(store, 'c', JULY_1 + 2, { importLimit: 2 }).allowed).toBe(false)
    expect(decide(store, 'c', JULY_1 + 2, { importLimit: 3 }).allowed).toBe(true)
    expect(store.window).toEqual({ count: 2, startedAt: JULY_1 })
  })

  it('keeps real Supporter status independent from unlimited dev-bypass allowances', () => {
    const supporterStore = new MeterStore()
    const devStore = new MeterStore()
    settle(supporterStore, 's', JULY_1, {
      importLimit: -1,
      refinementLimit: -1,
    })
    settle(devStore, 'd', JULY_1, {
      importLimit: -1,
      refinementLimit: -1,
    })

    expect(
      snapshot(supporterStore, 's', JULY_1, {
        isSupporter: true,
        importLimit: -1,
        refinementLimit: -1,
      })
    ).toEqual({
      remaining: null,
      limit: null,
      resetsAt: null,
      isSupporter: true,
      refinements: { remaining: null, limit: null },
    })
    expect(
      snapshot(devStore, 'd', JULY_1, {
        isSupporter: false,
        importLimit: -1,
        refinementLimit: -1,
      }).isSupporter
    ).toBe(false)
  })
})

describe('per-import refinement allowances', () => {
  it('supports finite, zero, and unlimited refinement limits without spending imports', () => {
    const finite = new MeterStore()
    settle(finite, 'hash', JULY_1)
    for (let i = 0; i < 5; i++) {
      expect(
        settle(finite, 'hash', JULY_1 + i + 1, { isRefinement: true }).decision
          .allowed
      ).toBe(true)
    }
    expect(decide(finite, 'hash', JULY_1 + 10, { isRefinement: true }).reason).toBe(
      'refinement_limit'
    )
    expect(finite.window.count).toBe(1)

    const zero = new MeterStore()
    settle(zero, 'hash', JULY_1)
    expect(
      decide(zero, 'hash', JULY_1 + 1, {
        isRefinement: true,
        refinementLimit: 0,
      }).reason
    ).toBe('refinement_limit')
    expect(decide(zero, 'hash', JULY_1 + 1, { refinementLimit: 0 }).allowed).toBe(
      true
    )

    const unlimited = new MeterStore()
    settle(unlimited, 'hash', JULY_1)
    for (let i = 0; i < 12; i++) {
      settle(unlimited, 'hash', JULY_1 + i + 1, {
        isRefinement: true,
        refinementLimit: -1,
      })
    }
    expect(unlimited.records.get('hash')?.refinements).toBe(12)
    expect(refinementUsage(unlimited.records.get('hash')!, -1)).toEqual({
      remaining: null,
      limit: null,
    })
  })

  it('folds a pending finite refinement into kickoff while terminal stays authoritative', () => {
    const store = new MeterStore()
    settle(store, 'hash', JULY_1)
    const decision = decide(store, 'hash', JULY_1 + 1, { isRefinement: true })
    const kickoff = computeKickoffCredits({
      decision,
      state: store.state('hash'),
      isSupporter: false,
      importLimit: 5,
      refinementLimit: 5,
      now: JULY_1 + 1,
      windowDurationMs: WINDOW_MS,
    })
    expect(kickoff.refinements).toEqual({ remaining: 4, limit: 5 })

    settle(store, 'hash', JULY_1 + 2, { isRefinement: true })
    expect(snapshot(store, 'hash', JULY_1 + 2).refinements).toEqual({
      remaining: 4,
      limit: 5,
    })
  })
})

describe('Empty Import grace', () => {
  it('does not charge, anchor, or record a within-grace Empty Import', () => {
    const store = new MeterStore()
    const { commit } = settle(store, 'empty', JULY_1, {
      isEmpty: true,
      emptyCount: 0,
      emptyLimit: 5,
    })
    expect(commit).toMatchObject({ emptyCharged: false, recordsEmptyRun: true })
    expect(store.window).toEqual({ count: 0, startedAt: null })
    expect(store.records.size).toBe(0)
  })

  it('charges and anchors an Empty Import after the separate grace is exhausted', () => {
    const store = new MeterStore()
    const { commit } = settle(store, 'empty', JULY_1, {
      isEmpty: true,
      emptyCount: 5,
      emptyLimit: 5,
    })
    expect(commit).toMatchObject({ emptyCharged: true, recordsEmptyRun: true })
    expect(store.window).toEqual({ count: 1, startedAt: JULY_1 })
    expect(store.records.get('empty')?.charged).toBe(true)
  })

  it('does not apply grace bookkeeping when unlimited usage had nothing to charge', () => {
    const store = new MeterStore()
    const { commit } = settle(store, 'empty', JULY_1, {
      importLimit: -1,
      isEmpty: true,
    })
    expect(commit).toMatchObject({ emptyCharged: false, recordsEmptyRun: false })
    expect(store.records.has('empty')).toBe(true)
  })
})

describe('account import usage (GET /notes-import/usage)', () => {
  const usage = (store: MeterStore, now: number, importLimit: Allowance = DEFAULT_IMPORTS) =>
    computeImportUsage({
      window: store.window,
      importLimit,
      now,
      windowDurationMs: WINDOW_MS,
    })

  it('reports a full allowance and no reset before the first charge', () => {
    expect(usage(new MeterStore(), JULY_1)).toEqual({
      limit: DEFAULT_IMPORTS,
      used: 0,
      remaining: DEFAULT_IMPORTS,
      resetsAt: null,
    })
  })

  it('agrees with the snapshot and the gate across a window', () => {
    const store = new MeterStore()
    settle(store, 'a', JULY_1)
    settle(store, 'b', JULY_1 + DAY_MS)
    const now = JULY_1 + 2 * DAY_MS
    const { remaining, limit, resetsAt } = snapshot(store, 'new', now)
    expect(usage(store, now)).toEqual({ limit, used: 2, remaining, resetsAt })
    expect(usage(store, now).resetsAt).toBe(
      new Date(JULY_1 + WINDOW_MS).toISOString()
    )

    for (const hash of ['c', 'd', 'e']) settle(store, hash, now)
    expect(usage(store, now)).toMatchObject({ used: 5, remaining: 0 })
    expect(decide(store, 'f', now)).toMatchObject({
      allowed: false,
      reason: 'limit_reached',
    })
  })

  it('frees the window at its end, inclusive', () => {
    const store = new MeterStore()
    settle(store, 'a', JULY_1)
    expect(usage(store, JULY_1 + WINDOW_MS - 1)).toMatchObject({ used: 1, remaining: 4 })
    expect(usage(store, JULY_1 + WINDOW_MS)).toEqual({
      limit: DEFAULT_IMPORTS,
      used: 0,
      remaining: DEFAULT_IMPORTS,
      resetsAt: null,
    })
  })

  it('reports unlimited without a reset, and a zero allowance as none left', () => {
    const store = new MeterStore()
    settle(store, 'a', JULY_1)
    expect(usage(store, JULY_1, -1)).toEqual({
      limit: null,
      used: 1,
      remaining: null,
      resetsAt: null,
    })
    expect(usage(new MeterStore(), JULY_1, 0)).toEqual({
      limit: 0,
      used: 0,
      remaining: 0,
      resetsAt: null,
    })
  })

  it('reports concurrent overage as used, with nothing left', () => {
    const store = new MeterStore()
    store.window = { count: 7, startedAt: JULY_1 }
    expect(usage(store, JULY_1)).toMatchObject({ used: 7, remaining: 0 })
  })
})
