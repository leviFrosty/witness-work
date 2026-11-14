import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNamespace, type FakeNamespace } from '../test/durableObjects'
import { DEFAULT_SCRIBE_LIMITS, type ScribeLimits } from './config'
import { ScribeMeter, CHARGE_RETENTION_MS, STEP_KEY_TTL_MS } from './meterDO'
import type { ScribePlan } from './wire'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: DurableObjectState
    env: unknown
    constructor(ctx: DurableObjectState, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  },
}))

const NOW = Date.UTC(2026, 9, 21, 14)
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const ACCOUNT = 'acct-1'
const TURN = '01JAAAAAAAAAAAAAAAAAAAAAAA'

let meters: FakeNamespace<ScribeMeter>
let meter: ScribeMeter

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  meters = createNamespace((state) => new ScribeMeter(state as never, {} as never))
  meter = meters.object(ACCOUNT)
})

afterEach(() => {
  vi.useRealTimers()
})

const limits = (overrides: Partial<ScribeLimits> = {}): ScribeLimits => ({
  ...DEFAULT_SCRIBE_LIMITS,
  ...overrides,
})

/** A free plan with one limit for every week, the first included. */
const freeOf = (weekly: number) => ({
  free: { ...DEFAULT_SCRIBE_LIMITS.free, weekly, welcome: weekly },
})

const context = (
  fields: { now?: number; plan?: ScribePlan; limits?: ScribeLimits } = {}
) => ({
  plan: fields.plan ?? ('free' as ScribePlan),
  supporterCheckFailed: false,
  limits: fields.limits ?? limits(),
  now: fields.now ?? NOW,
})

const admit = (step = 0, fields: Parameters<typeof context>[0] & { turnId?: string } = {}) =>
  meter.admitStep({ ...context(fields), turnId: fields.turnId ?? TURN, step })

const settle = (
  step: number,
  units: number,
  fields: Parameters<typeof context>[0] & { turnId?: string } = {}
) => meter.settleStep({ ...context(fields), turnId: fields.turnId ?? TURN, step, units })

const rows = (sql: string) => meters.storage(ACCOUNT).query(sql)

describe('step keys', () => {
  it('admits a step, then refuses the same key while it runs', () => {
    const first = admit(0)
    expect(first).toMatchObject({ ok: true, slot: `${TURN}:0`, grace: false })
    expect(admit(0)).toEqual({ ok: false, code: 'step_in_progress' })
  })

  it('allows a retry after settling, up to three attempts', () => {
    admit(0)
    settle(0, 0)
    expect(admit(0).ok).toBe(true)
    settle(0, 0)
    expect(admit(0).ok).toBe(true)
    settle(0, 0)
    expect(admit(0)).toEqual({ ok: false, code: 'step_retry_limit' })
  })

  it('forgets a key after an hour', () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      admit(0)
      settle(0, 0)
    }
    expect(admit(0, { now: NOW + STEP_KEY_TTL_MS }).ok).toBe(true)
  })

  it('records only turn ids, step numbers, states and times', () => {
    admit(0)
    expect(rows('SELECT turn_id, step, state, attempts FROM step_key')).toEqual([
      { turn_id: TURN, step: 0, state: 'running', attempts: 1 },
    ])
  })
})

describe('active cap', () => {
  it('refuses a third concurrent step, and frees the slot on settle', () => {
    expect(admit(0, { turnId: 'T1' }).ok).toBe(true)
    expect(admit(0, { turnId: 'T2' }).ok).toBe(true)
    expect(admit(0, { turnId: 'T3' })).toEqual({ ok: false, code: 'active_cap' })
    settle(0, 10, { turnId: 'T1' })
    expect(admit(0, { turnId: 'T3' }).ok).toBe(true)
  })

  it('releases a step that never settled after stepTimeoutMs + 30 s', () => {
    admit(0, { turnId: 'T1' })
    admit(0, { turnId: 'T2' })
    const almost = NOW + DEFAULT_SCRIBE_LIMITS.stepTimeoutMs + 29_000
    expect(admit(0, { turnId: 'T3', now: almost })).toEqual({ ok: false, code: 'active_cap' })
    const stale = NOW + DEFAULT_SCRIBE_LIMITS.stepTimeoutMs + 30_000
    expect(admit(0, { turnId: 'T3', now: stale }).ok).toBe(true)
    // The abandoned key can be retried rather than reporting step_in_progress.
    expect(admit(0, { turnId: 'T1', now: stale }).ok).toBe(true)
    expect(rows("SELECT turn_id FROM step_key WHERE state = 'running' ORDER BY turn_id")).toEqual([
      { turn_id: 'T1' },
      { turn_id: 'T3' },
    ])
  })
})

describe('windows', () => {
  it('charges every window on settle and answers the same snapshot as usage()', () => {
    admit(0)
    const snapshot = settle(0, 5_000)
    const week = {
      percentUsed: 3,
      resetsAt: NOW + 7 * DAY,
      units: { used: 5_000, limit: 150_000 },
    }
    expect(snapshot.windows).toEqual([
      { id: 'weekly', ...week },
      { id: 'monthly', ...week },
    ])
    expect(meter.usage(context())).toEqual(snapshot)
    expect(meter.usage(context({ plan: 'supporter' })).windows.map((w) => w.units.used)).toEqual([
      5_000, 5_000,
    ])
  })

  it('refuses with a snapshot once full, and lets an open turn finish within grace', () => {
    const tight = limits(freeOf(1_000))
    admit(0, { limits: tight })
    settle(0, 1_200, { limits: tight })
    const next = admit(1, { limits: tight })
    expect(next).toMatchObject({ ok: true, grace: true })
    settle(1, 300, { limits: tight })
    const refused = admit(0, { limits: tight, turnId: 'T-next' })
    expect(refused).toMatchObject({ ok: false, code: 'limit_reached' })
    if (refused.ok || refused.code !== 'limit_reached') throw new Error('expected limit_reached')
    expect(refused.snapshot.limited).toBe(true)
    expect(refused.snapshot.resetsAt).toBe(NOW + 7 * DAY)
  })

  it('gives a free account the welcome limit in its first week, then the weekly one', () => {
    admit(0)
    settle(0, 30_000)
    // Past the weekly limit, inside the welcome one.
    expect(meter.usage(context()).windows[0].units).toEqual({ used: 30_000, limit: 150_000 })
    expect(admit(0, { turnId: 'T2' }).ok).toBe(true)
    settle(0, 10, { turnId: 'T2' })

    const nextWeek = NOW + 7 * DAY
    expect(admit(0, { turnId: 'T3', now: nextWeek }).ok).toBe(true)
    settle(0, 30_000, { turnId: 'T3', now: nextWeek })
    expect(meter.usage(context({ now: nextWeek })).windows[0].units).toEqual({
      used: 30_000,
      limit: 25_000,
    })
    expect(admit(0, { turnId: 'T4', now: nextWeek })).toMatchObject({
      ok: false,
      code: 'limit_reached',
    })
  })

  it('closes the grace after turnGraceMinutes', () => {
    const tight = limits(freeOf(1_000))
    admit(0, { limits: tight })
    settle(0, 1_200, { limits: tight })
    expect(
      admit(1, { limits: tight, now: NOW + 31 * MINUTE })
    ).toMatchObject({ ok: false, code: 'limit_reached' })
  })

  it('usage() starts no window', () => {
    meter.usage(context())
    expect(rows('SELECT * FROM usage_window')).toEqual([])
  })

  it('resets every window and the day’s pages', () => {
    admit(0)
    settle(0, 7_000)
    meter.admitTranscribe({ ...context(), pageLimit: 40 })
    expect(meter.resetUsage(NOW)).toEqual({
      previous: { session: 7_000, weekly: 7_000, monthly: 7_000 },
    })
    expect(meter.usage(context()).windows[0].units.used).toBe(0)
    expect(rows('SELECT * FROM page')).toEqual([])
  })
})

describe('retention', () => {
  it('prunes charges after 31 days', () => {
    meter.charge({ ...context(), units: 100, kind: 'step' })
    meter.charge({ ...context({ now: NOW + DAY }), units: 100, kind: 'transcribe' })
    meter.charge({ ...context({ now: NOW + CHARGE_RETENTION_MS }), units: 100, kind: 'step' })
    expect(rows('SELECT at, kind FROM charge ORDER BY at')).toEqual([
      { at: NOW + DAY, kind: 'transcribe' },
      { at: NOW + CHARGE_RETENTION_MS, kind: 'step' },
    ])
  })

  it('counts pages over a rolling day', () => {
    for (let page = 0; page < 2; page++)
      expect(meter.admitTranscribe({ ...context(), pageLimit: 2 }).ok).toBe(true)
    expect(meter.admitTranscribe({ ...context({ now: NOW + MINUTE }), pageLimit: 2 })).toEqual({
      ok: false,
      code: 'transcribe_limit',
      retryAfterMs: DAY - MINUTE,
    })
    expect(meter.admitTranscribe({ ...context({ now: NOW + DAY }), pageLimit: 2 }).ok).toBe(true)
    expect(meter.admitTranscribe({ ...context(), pageLimit: -1 }).ok).toBe(true)
  })

  it('refuses a page when the meter is full', () => {
    const tight = limits(freeOf(10))
    meter.charge({ ...context({ limits: tight }), units: 10, kind: 'step' })
    expect(
      meter.admitTranscribe({ ...context({ limits: tight }), pageLimit: 40 })
    ).toMatchObject({ ok: false, code: 'limit_reached' })
  })

  it('admits a one-shot call on the windows alone, without counting a page', () => {
    const tight = limits(freeOf(10))
    expect(meter.admitCall(context({ limits: tight }))).toMatchObject({ ok: true })
    expect(rows('SELECT COUNT(*) AS n FROM page')).toEqual([{ n: 0 }])
    meter.charge({ ...context({ limits: tight }), units: 10, kind: 'territory_notes' })
    expect(meter.admitCall(context({ limits: tight }))).toMatchObject({
      ok: false,
      code: 'limit_reached',
      snapshot: { limited: true },
    })
    expect(rows('SELECT kind FROM charge')).toEqual([{ kind: 'territory_notes' }])
  })

  it('deletes the object 31 days after its last activity', async () => {
    admit(0)
    settle(0, 100)
    expect(meters.storage(ACCOUNT).alarm()).toBe(NOW + CHARGE_RETENTION_MS)
    vi.setSystemTime(NOW + DAY)
    await meters.fireAlarm(ACCOUNT)
    // Not yet: rescheduled from the last charge.
    expect(meters.storage(ACCOUNT).alarm()).toBe(NOW + CHARGE_RETENTION_MS)
    expect(rows('SELECT COUNT(*) AS n FROM charge')).toEqual([{ n: 1 }])
    vi.setSystemTime(NOW + CHARGE_RETENTION_MS)
    await meters.fireAlarm(ACCOUNT)
    expect(meters.storage(ACCOUNT).tables()).toEqual([])
  })
})
