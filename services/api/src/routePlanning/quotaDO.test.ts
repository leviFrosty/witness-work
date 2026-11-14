import { afterEach, describe, expect, it, vi } from 'vitest'

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

import { createSqliteState } from '../test/durableObjects'
import { RoutePlanningQuota } from './quotaDO'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const T0 = Date.UTC(2026, 9, 5, 8)
const limits = { dailyLimit: 10, minuteLimit: 3 }

const setup = () => {
  const storage = createSqliteState('account')
  const quota = new RoutePlanningQuota(storage.state, {} as never)
  const consume = (nowMs: number) => quota.consume({ nowMs, ...limits })
  return { storage, quota, consume }
}

afterEach(() => vi.useRealTimers())

describe('RoutePlanningQuota', () => {
  it('allows three a minute, then says when the next one fits', async () => {
    const { consume } = setup()
    expect(await consume(T0)).toEqual({ allowed: true, remainingToday: 9 })
    expect(await consume(T0 + 1000)).toEqual({ allowed: true, remainingToday: 8 })
    expect(await consume(T0 + 2000)).toEqual({ allowed: true, remainingToday: 7 })
    expect(await consume(T0 + 10_000)).toEqual({
      allowed: false,
      reason: 'minute',
      retryAfterSeconds: 50,
      remainingToday: 7,
    })
    expect((await consume(T0 + MINUTE + 1)).allowed).toBe(true)
  })

  it('caps an account at ten in any 24 hours and does not charge denials', async () => {
    const { consume, storage } = setup()
    for (let i = 0; i < 10; i++) {
      expect((await consume(T0 + i * 5 * MINUTE)).allowed).toBe(true)
    }
    const denied = await consume(T0 + 2 * 60 * MINUTE)
    expect(denied).toEqual({
      allowed: false,
      reason: 'daily',
      retryAfterSeconds: (DAY - 2 * 60 * MINUTE) / 1000,
      remainingToday: 0,
    })
    expect(storage.query('SELECT COUNT(*) AS n FROM optimization')).toEqual([
      { n: 10 },
    ])
    // The first one ages out after a day; the window rolls, it doesn't reset.
    expect(await consume(T0 + DAY + 1)).toEqual({
      allowed: true,
      remainingToday: 0,
    })
    expect((await consume(T0 + DAY + MINUTE)).allowed).toBe(false)
  })

  it('forgets the account a day after its newest optimization', async () => {
    const { consume, quota, storage } = setup()
    await consume(T0)
    await consume(T0 + 3 * 60 * MINUTE)
    expect(storage.alarm()).toBe(T0 + 3 * 60 * MINUTE + DAY)

    vi.useFakeTimers({ now: T0 + DAY + 1 })
    storage.clearAlarm()
    await quota.alarm()
    expect(storage.query('SELECT at FROM optimization')).toEqual([
      { at: T0 + 3 * 60 * MINUTE },
    ])
    expect(storage.alarm()).toBe(T0 + 3 * 60 * MINUTE + DAY)

    vi.setSystemTime(T0 + 3 * 60 * MINUTE + DAY)
    storage.clearAlarm()
    await quota.alarm()
    expect(storage.tables()).toEqual([])
    expect(storage.alarm()).toBeNull()
    // A fresh object after cleanup still works.
    expect((await consume(T0 + 2 * DAY)).allowed).toBe(true)
  })
})
