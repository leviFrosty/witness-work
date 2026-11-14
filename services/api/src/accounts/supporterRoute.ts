import type { AppContext } from '../types'
import { RevenueCatError } from '../revenuecat'
import { buddiesErrorResponse } from '../buddies/errorResponse'
import {
  EDGE_RETRY_AFTER_SECONDS,
  allowBuddiesCaller,
  buddiesAccountCallerKey,
} from '../buddies/limits'
import { authenticateAccount, readPlainJson } from './auth'
import { guarded, refuseAtEdge } from './signed'
import { accountsDb } from './store'
import {
  CustomerLockedError,
  REVENUECAT_APP_USER_ID,
  accountSupporterStatus,
  linkCustomer,
  type AccountSupporterStatus,
  type SupporterDependencies,
} from './supporter'

/**
 * Supporter status on the account (witness-work ADR 0029):
 *
 * - `POST /accounts/v1/revenuecat-customers` `{ appUserId }`: Bearer. Reads
 *   the RevenueCat customer the app is logged in as, stores what RevenueCat
 *   says, links it to the token's account, and answers the account's status.
 * - `GET /accounts/v1/supporter`: Bearer. The account's status.
 *
 * Both work for a suspended account and count against the read edge tier.
 * Every link also reads RevenueCat, so it counts against the register tier
 * per account too: the read tier alone would let one account spend the
 * worker's shared RevenueCat rate limit. RevenueCat unreachable is 503
 * `unavailable` with `Retry-After`.
 *
 * Privacy: nothing here logs or reports the token, the account id, or the
 * app user id.
 */

const statusBody = (status: AccountSupporterStatus) => ({
  ok: true as const,
  supporter: status.supporter,
  expiresAt: status.expiresAt,
})

const unavailable = () => buddiesErrorResponse('unavailable')

export const createSupporterHandlers = (
  overrides: Partial<SupporterDependencies> = {}
) => ({
  link: guarded('revenuecat-customers', async (c: AppContext) => {
    const d1 = c.env.ACCOUNTS_DB
    if (!d1) return buddiesErrorResponse('disabled')
    const limited = await refuseAtEdge(c, 'inbox/sync')
    if (limited) return limited
    const auth = await authenticateAccount(c)
    if (!auth.ok) return auth.response
    const callerKey = await buddiesAccountCallerKey(auth.account.accountId)
    if (!(await allowBuddiesCaller(c.env, 'inbox/register', callerKey)))
      return buddiesErrorResponse('rate_limited', {
        retryAfterSeconds: EDGE_RETRY_AFTER_SECONDS,
      })

    const body = await readPlainJson(c)
    const appUserId =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).appUserId
        : undefined
    if (
      typeof appUserId !== 'string' ||
      !REVENUECAT_APP_USER_ID.test(appUserId)
    )
      return buddiesErrorResponse('bad_request')

    try {
      const status = await linkCustomer(
        c.env,
        accountsDb(d1),
        auth.account.accountId,
        appUserId,
        overrides
      )
      return c.json(statusBody(status))
    } catch (error) {
      if (error instanceof RevenueCatError) return unavailable()
      if (error instanceof CustomerLockedError)
        return buddiesErrorResponse('conflict', {
          extras: { reason: 'customer_locked' },
        })
      throw error
    }
  }),

  status: guarded('supporter', async (c: AppContext) => {
    const d1 = c.env.ACCOUNTS_DB
    if (!d1) return buddiesErrorResponse('disabled')
    const limited = await refuseAtEdge(c, 'inbox/sync')
    if (limited) return limited
    const auth = await authenticateAccount(c)
    if (!auth.ok) return auth.response
    try {
      const status = await accountSupporterStatus(
        c.env,
        accountsDb(d1),
        auth.account.accountId,
        overrides
      )
      return c.json({ ...statusBody(status), customers: status.customers })
    } catch (error) {
      if (error instanceof RevenueCatError) return unavailable()
      throw error
    }
  }),
})

export const supporterHandlers = createSupporterHandlers()
