import { Hono } from 'hono'
import type { AppContext, AppEnv } from '../types'
import { captureFailure } from '../sentry'
import { timingSafeEqual } from '../crypto'
import { apiError } from '../errors'
import { BUDDIES_ID_PATTERN } from '../buddies/contracts'
import { isAccountId } from './contracts'
import {
  ACCOUNT_STATUS_REASONS,
  ACCOUNT_STATUSES,
  type AccountStatus,
  type AccountStatusReason,
} from './schema'
import {
  accountInboxIds,
  accountsDb,
  findAccount,
  findInboxAccount,
  setAccountStatus,
  type AccountRecord,
} from './store'
import { accountLookupDocs, accountStatusDocs } from './openapi'
import { forgetAccountStatus } from './auth'

/**
 * Maintainer-only account moderation, authorized by `x-ww-admin-token`
 * (`ADMIN_API_TOKEN`). A missing token, a wrong one, and a worker without the
 * accounts database all answer the same 404 as an unknown route. Ids are
 * never logged.
 *
 * - `POST /admin/accounts/lookup` `{ inboxId }` or `{ accountId }`: the
 *   account, its status, and its inboxes. A report names the buddy's
 *   `inboxId`; this finds the account behind it.
 * - `POST /admin/accounts/status` `{ accountId, status, reason }`: suspends or
 *   reinstates the account, records why, and tells each of its inboxes.
 */

const notFound = () => apiError(404, 'not_found')
const badRequest = (message: string) =>
  apiError(400, 'bad_request', { message })

const authorized = (c: AppContext): boolean => {
  const expected = c.env.ADMIN_API_TOKEN
  const supplied = c.req.header('x-ww-admin-token') ?? ''
  return Boolean(expected) && timingSafeEqual(supplied, expected!)
}

const readBody = async (
  c: AppContext
): Promise<Record<string, unknown> | null> => {
  try {
    const body: unknown = await c.req.json()
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const describe = async (
  db: ReturnType<typeof accountsDb>,
  account: AccountRecord
) => ({
  id: account.id,
  status: account.status,
  inboxIds: await accountInboxIds(db, account.id),
})

const handleLookup = async (c: AppContext): Promise<Response> => {
  if (!authorized(c) || !c.env.ACCOUNTS_DB) return notFound()
  const body = await readBody(c)
  if (!body) return badRequest('Invalid JSON')
  const db = accountsDb(c.env.ACCOUNTS_DB)
  let account: AccountRecord | null
  if (typeof body.inboxId === 'string') {
    if (!BUDDIES_ID_PATTERN.test(body.inboxId))
      return badRequest('Invalid inboxId')
    account = await findInboxAccount(db, body.inboxId)
  } else if (isAccountId(body.accountId)) {
    account = await findAccount(db, body.accountId)
  } else {
    return badRequest('Expected inboxId or accountId')
  }
  if (!account) return apiError(404, 'unknown_account')
  return c.json({ ok: true, account: await describe(db, account) })
}

const isStatus = (value: unknown): value is AccountStatus =>
  (ACCOUNT_STATUSES as readonly unknown[]).includes(value)

const isReason = (value: unknown): value is AccountStatusReason =>
  (ACCOUNT_STATUS_REASONS as readonly unknown[]).includes(value)

const handleStatus = async (c: AppContext): Promise<Response> => {
  if (!authorized(c) || !c.env.ACCOUNTS_DB) return notFound()
  const body = await readBody(c)
  if (!body) return badRequest('Invalid JSON')
  const { accountId, status, reason } = body
  if (!isAccountId(accountId)) return badRequest('Invalid accountId')
  if (!isStatus(status)) return badRequest('Invalid status')
  if (!isReason(reason)) return badRequest('Invalid reason')

  const db = accountsDb(c.env.ACCOUNTS_DB)
  const account = await findAccount(db, accountId)
  if (!account) return apiError(404, 'unknown_account')
  await setAccountStatus(db, accountId, status, reason)
  forgetAccountStatus(accountId)

  // The database is the authority (registration checks it); the inboxes keep
  // a copy so their hot path never reads it. A failed inbox is reported, and
  // sending the same request again retries it.
  const inboxIds = await accountInboxIds(db, accountId)
  const results = await Promise.allSettled(
    inboxIds.map((inboxId) =>
      c.env.BUDDY_INBOX.get(
        c.env.BUDDY_INBOX.idFromName(inboxId)
      ).setAccountStatus(accountId, status === 'suspended')
    )
  )
  const failed = results.filter((result) => result.status === 'rejected')
  for (const result of failed)
    captureFailure(result.reason, 'admin/accounts/status')
  return c.json({
    ok: failed.length === 0,
    account: await describe(db, { ...account, status }),
    inboxesUpdated: inboxIds.length - failed.length,
    inboxesFailed: failed.length,
  })
}

/** Mounted at `/admin/accounts` (behind the `admin` rate limit). */
export const createAccountsAdminRoutes = () => {
  const routes = new Hono<AppEnv>()
  routes.post('/lookup', accountLookupDocs, handleLookup)
  routes.post('/status', accountStatusDocs, handleStatus)
  return routes
}
