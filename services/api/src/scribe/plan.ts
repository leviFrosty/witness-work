import type { Environment } from '../types'
import { captureFailure } from '../sentry'
import type { AccountAuth } from '../accounts/auth'
import { isAccountSupporter } from '../accounts/supporter'
import { RevenueCatError } from '../revenuecat'
import type { DevSessionMetering } from './config'
import type { ScribePlan } from './wire'

/**
 * The plan an account is metered under (ADR 0029), with a short per-isolate
 * cache for steps and pages: the answer is a D1 read, sometimes a RevenueCat
 * call, on the serial path before admission. `GET /scribe/v1/usage` always
 * asks afresh (and refreshes the cache), and a refusal is never based on a
 * cached answer (`admitWithPlan`), so a new Supporter is never held back by
 * it; a step may otherwise show the previous plan's windows for up to
 * `PLAN_CACHE_MS`.
 */

export interface PlanResolution {
  plan: ScribePlan
  supporterCheckFailed: boolean
  /** From this isolate's cache rather than a fresh check. */
  cached: boolean
}

export const PLAN_CACHE_MS = 30_000
const PLAN_CACHE_ENTRIES = 1_000
const planCache = new Map<string, { plan: ScribePlan; at: number }>()

/** Clears the per-isolate plan cache (tests). */
export const resetPlanCache = (): void => planCache.clear()

export interface ResolvePlanOptions {
  /** Answer from the cache when it's fresh. Off: always ask, then cache the answer. */
  useCache?: boolean
  now?: number
}

/**
 * RevenueCat unreachable while the account's record was stale meters it as
 * free with `supporterCheckFailed` (never cached). A dev session asks no one:
 * it's the plan `scribe:dev-session` names (free unless it says otherwise).
 * Never rejects.
 */
export const resolvePlan = async (
  env: Environment,
  account: AccountAuth,
  dev: DevSessionMetering | null,
  { useCache = false, now = Date.now() }: ResolvePlanOptions = {}
): Promise<PlanResolution> => {
  if (dev) return { plan: dev.plan, supporterCheckFailed: false, cached: false }
  const { accountId } = account
  const hit = planCache.get(accountId)
  if (useCache && hit && now - hit.at < PLAN_CACHE_MS)
    return { plan: hit.plan, supporterCheckFailed: false, cached: true }
  try {
    const plan: ScribePlan = (await isAccountSupporter(env, accountId)) ? 'supporter' : 'free'
    planCache.delete(accountId)
    if (planCache.size >= PLAN_CACHE_ENTRIES) planCache.delete(planCache.keys().next().value!)
    planCache.set(accountId, { plan, at: now })
    return { plan, supporterCheckFailed: false, cached: false }
  } catch (error) {
    planCache.delete(accountId)
    if (!(error instanceof RevenueCatError)) captureFailure(error, 'scribe supporter')
    return { plan: 'free', supporterCheckFailed: true, cached: false }
  }
}

/**
 * Admits under `planning`'s answer. When that answer was cached and admission
 * refused, asks afresh and, if the plan changed, admits once more under the
 * fresh one: a refusal never rests on a cached plan. A refused admission
 * changes nothing in the meter, so asking twice is safe.
 */
export const admitWithPlan = async <T>(
  planning: Promise<PlanResolution>,
  refresh: () => Promise<PlanResolution>,
  admit: (plan: PlanResolution) => PromiseLike<T>,
  refused: (result: T) => boolean
): Promise<{ plan: PlanResolution; result: T }> => {
  const plan = await planning
  const result = await admit(plan)
  if (!plan.cached || !refused(result)) return { plan, result }
  const fresh = await refresh()
  if (fresh.plan === plan.plan) return { plan, result }
  return { plan: fresh, result: await admit(fresh) }
}
