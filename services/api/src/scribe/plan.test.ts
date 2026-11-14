import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Environment } from '../types'
import type { AccountAuth } from '../accounts/auth'
import { RevenueCatError } from '../revenuecat'
import {
  PLAN_CACHE_MS,
  admitWithPlan,
  resetPlanCache,
  resolvePlan,
  type PlanResolution,
} from './plan'

const mocks = vi.hoisted(() => ({ isAccountSupporter: vi.fn() }))

vi.mock('../accounts/supporter', () => ({ isAccountSupporter: mocks.isAccountSupporter }))
vi.mock('../sentry', () => ({ captureFailure: vi.fn() }))

const env = {} as Environment
const account = { accountId: 'acct_1', platform: 'ios' } as AccountAuth
const NOW = Date.UTC(2026, 9, 21, 14)

beforeEach(() => {
  resetPlanCache()
  mocks.isAccountSupporter.mockReset()
  mocks.isAccountSupporter.mockResolvedValue(false)
})

describe('resolvePlan', () => {
  it('asks no one for a dev session', async () => {
    const plan = await resolvePlan(env, account, { realLimits: true, plan: 'supporter' }, { useCache: true })
    expect(plan).toEqual({ plan: 'supporter', supporterCheckFailed: false, cached: false })
    expect(mocks.isAccountSupporter).not.toHaveBeenCalled()
  })

  it('answers from the cache for PLAN_CACHE_MS, then asks again', async () => {
    mocks.isAccountSupporter.mockResolvedValue(true)
    const ask = (now: number) => resolvePlan(env, account, null, { useCache: true, now })
    expect(await ask(NOW)).toEqual({ plan: 'supporter', supporterCheckFailed: false, cached: false })
    mocks.isAccountSupporter.mockResolvedValue(false)
    expect(await ask(NOW + PLAN_CACHE_MS - 1)).toEqual({
      plan: 'supporter',
      supporterCheckFailed: false,
      cached: true,
    })
    expect(mocks.isAccountSupporter).toHaveBeenCalledTimes(1)
    expect(await ask(NOW + PLAN_CACHE_MS)).toMatchObject({ plan: 'free', cached: false })
    expect(mocks.isAccountSupporter).toHaveBeenCalledTimes(2)
  })

  it('always asks without useCache, and refreshes the cache for steps', async () => {
    await resolvePlan(env, account, null, { useCache: true, now: NOW })
    mocks.isAccountSupporter.mockResolvedValue(true)
    expect(await resolvePlan(env, account, null, { now: NOW + 1 })).toMatchObject({
      plan: 'supporter',
      cached: false,
    })
    expect(await resolvePlan(env, account, null, { useCache: true, now: NOW + 2 })).toMatchObject({
      plan: 'supporter',
      cached: true,
    })
  })

  it('never caches a failed check, and drops an older answer', async () => {
    mocks.isAccountSupporter.mockResolvedValue(true)
    await resolvePlan(env, account, null, { now: NOW })
    mocks.isAccountSupporter.mockRejectedValue(new RevenueCatError('down'))
    expect(await resolvePlan(env, account, null, { now: NOW + 1 })).toEqual({
      plan: 'free',
      supporterCheckFailed: true,
      cached: false,
    })
    mocks.isAccountSupporter.mockResolvedValue(true)
    expect(await resolvePlan(env, account, null, { useCache: true, now: NOW + 2 })).toMatchObject({
      plan: 'supporter',
      cached: false,
    })
  })

  it('keeps each account’s answer apart', async () => {
    mocks.isAccountSupporter.mockImplementation(async (_env, id: string) => id === 'acct_2')
    await resolvePlan(env, account, null, { now: NOW })
    const other = { ...account, accountId: 'acct_2' }
    expect(await resolvePlan(env, other, null, { useCache: true, now: NOW })).toMatchObject({
      plan: 'supporter',
      cached: false,
    })
    expect(await resolvePlan(env, account, null, { useCache: true, now: NOW })).toMatchObject({
      plan: 'free',
      cached: true,
    })
  })
})

describe('admitWithPlan', () => {
  const resolution = (plan: PlanResolution['plan'], cached: boolean): PlanResolution => ({
    plan,
    supporterCheckFailed: false,
    cached,
  })
  type Result = { ok: boolean; plan: string }
  const admit = vi.fn(async (p: PlanResolution): Promise<Result> => ({
    ok: p.plan === 'supporter',
    plan: p.plan,
  }))
  const refused = (result: Result) => !result.ok

  beforeEach(() => {
    admit.mockClear()
  })

  it('admits once when the answer was fresh, even if refused', async () => {
    const refresh = vi.fn()
    const out = await admitWithPlan(Promise.resolve(resolution('free', false)), refresh, admit, refused)
    expect(out.result).toEqual({ ok: false, plan: 'free' })
    expect(refresh).not.toHaveBeenCalled()
    expect(admit).toHaveBeenCalledTimes(1)
  })

  it('admits once when a cached answer is admitted', async () => {
    const refresh = vi.fn()
    const out = await admitWithPlan(Promise.resolve(resolution('supporter', true)), refresh, admit, refused)
    expect(out).toEqual({ plan: resolution('supporter', true), result: { ok: true, plan: 'supporter' } })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('keeps the refusal when a fresh check agrees with the cache', async () => {
    const refresh = vi.fn(async () => resolution('free', false))
    const out = await admitWithPlan(Promise.resolve(resolution('free', true)), refresh, admit, refused)
    expect(out.result).toEqual({ ok: false, plan: 'free' })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(admit).toHaveBeenCalledTimes(1)
  })

  it('admits again under a fresh plan when a cached one was refused', async () => {
    const refresh = vi.fn(async () => resolution('supporter', false))
    const out = await admitWithPlan(Promise.resolve(resolution('free', true)), refresh, admit, refused)
    expect(out).toEqual({
      plan: resolution('supporter', false),
      result: { ok: true, plan: 'supporter' },
    })
    expect(admit).toHaveBeenCalledTimes(2)
  })
})
