import { buddiesErrorResponse } from '../buddies/errorResponse'
import { authenticateAccount } from './auth'
import { ACTIVITY_LIMITS, listActivity } from './activity'
import { openActivityId } from './activityIds'
import { accessTokenKeys, activityIdKeys } from './tokens'
import { guarded, refuseAtEdge } from './signed'
import { accountsDb } from './store'

/**
 * `GET /accounts/v1/activity?limit=&before=`: Bearer. The token's account's
 * activity log (witness-work ADR 0028), newest first, one page at a time.
 * Works for a suspended account. Counts against the read edge tier. A
 * caller whose session has ended is 401 (`requireLiveSession`). Ids and
 * cursors are sealed for the account (src/accounts/activityIds.ts); a
 * cursor that doesn't open for it is 400.
 *
 * Privacy: nothing here logs or reports the token, the account id, or an
 * entry.
 */
export const handleActivity = guarded('activity', async (c) => {
  const d1 = c.env.ACCOUNTS_DB
  if (!d1) return buddiesErrorResponse('disabled')
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return auth.response
  const keys = await accessTokenKeys(c.env)
  if (!keys) return buddiesErrorResponse('disabled')
  const { accountId } = auth.account

  const limitParam = c.req.query('limit')
  const beforeParam = c.req.query('before')
  const limit =
    limitParam == null ? ACTIVITY_LIMITS.pageSize : Number(limitParam)
  const before =
    beforeParam == null
      ? undefined
      : await openActivityId(activityIdKeys(keys), accountId, beforeParam)
  if (
    !/^[0-9]+$/.test(limitParam ?? '0') ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > ACTIVITY_LIMITS.maxPageSize ||
    before === null
  )
    return buddiesErrorResponse('bad_request')

  const page = await listActivity(accountsDb(d1), accountId, {
    before,
    limit,
    idKeys: keys.current.activityIds,
  })
  return c.json({ ok: true, ...page })
})
