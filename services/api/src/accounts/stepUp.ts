import { buddiesErrorResponse } from '../buddies/errorResponse'
import { ACCOUNT_LIMITS } from './contracts'
import type { AccountAuth } from './auth'
import type { AccountsDb } from './store'
import { sessionStepUpAt } from './sessionStore'
import type { SessionPlatform } from './schema'

/**
 * The platforms that never need a step-up: attested phones (and the
 * development bypass). An allow-list, so a platform added later needs one
 * until it's listed here.
 */
export const STEP_UP_EXEMPT: readonly SessionPlatform[] = ['ios', 'android', 'dev']

/**
 * Step-up on the web (witness-work `docs/passkeys-protocol.md`): adding or
 * removing a passkey, deleting backups, and changing the account key need a
 * web session to have passed a server-checked passkey tap (or opened) in the
 * last 5 minutes. Phone sessions are exempt (`STEP_UP_EXEMPT`): they
 * attested, and check Face ID on the device.
 *
 * Null when the session may go ahead; else 403 `step_up_required`.
 */
export const refuseWithoutStepUp = async (
  db: AccountsDb,
  account: AccountAuth,
  now: number = Date.now()
): Promise<Response | null> => {
  if (STEP_UP_EXEMPT.includes(account.platform)) return null
  const at = await sessionStepUpAt(db, account.accountId, account.sessionId)
  return at != null && now - at <= ACCOUNT_LIMITS.stepUpMs
    ? null
    : buddiesErrorResponse('step_up_required')
}
