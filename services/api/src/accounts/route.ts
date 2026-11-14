import { Hono } from 'hono'
import type { AppContext, AppEnv } from '../types'
import { buddiesErrorResponse } from '../buddies/errorResponse'
import { buddiesCallerKey } from '../buddies/limits'
import {
  accountsDb,
  findAccountInfo,
  keyRetiredResponse,
  newAccountId,
  registerAccount,
  type AccountInfo,
} from './store'
import {
  guarded,
  quotaName,
  refuseAtEdge,
  refuseOverDailyQuota,
  verifiedBody,
} from './signed'
import { authenticateAccount, bearerOrLegacy } from './auth'
import { refuseLegacyAuth } from './legacySwitch'
import { handoffHandlers } from './handoff'
import { backupHandlers } from './backup'
import { sessionHandlers } from './session'
import { handleActivity } from './activityRoute'
import { supporterHandlers } from './supporterRoute'
import { syncHandlers } from './sync'
import { syncPhotoHandlers } from './syncPhotos'
import { passkeyHandlers } from './passkeys'
import { webHandlers } from './webSignup'
import { approvalHandlers } from './approval'
import { rekeyHandlers } from './rekey'
import {
  passkeyAddDocs,
  passkeyAssertDocs,
  passkeyChallengeDocs,
  passkeyListDocs,
  passkeyRegisterOptionsDocs,
  passkeyRemoveDocs,
  passkeyWrapDocs,
} from './passkeyOpenapi'
import {
  webRecoveryDocs,
  webSignupDocs,
  webSignupOptionsDocs,
} from './webSignupOpenapi'
import {
  approvalCancelDocs,
  approvalClaimDocs,
  approvalDoneDocs,
  approvalOpenDocs,
  approvalReceiveDocs,
  approvalSendDocs,
  approvalStatusDocs,
} from './approvalOpenapi'
import { handleLiveTicket } from './liveTickets'
import {
  accountDocs,
  accountKeyHistoryDocs,
  accountRekeyDocs,
  activityListDocs,
  accountInfoDocs,
  accountRegisterDocs,
  backupDeleteDocs,
  backupGetDocs,
  backupListDocs,
  backupPutDocs,
  handoffCancelDocs,
  handoffClaimDocs,
  handoffDoneDocs,
  handoffOpenDocs,
  handoffReceiveDocs,
  handoffSendDocs,
  handoffStatusDocs,
  liveTicketDocs,
  sessionCloseDocs,
  sessionOpenDocs,
  sessionListDocs,
  sessionRefreshDocs,
  sessionRevokeDocs,
  supporterLinkDocs,
  supporterStatusDocs,
  syncDeleteDocs,
  syncGetDocs,
  syncChangePutDocs,
  syncChangeResealDocs,
  syncChangesListDocs,
  syncListDocs,
  syncLiveDocs,
  syncPhotoDeleteDocs,
  syncPhotoGetDocs,
  syncPhotoListDocs,
  syncPhotoPutDocs,
  syncPhotoUsageDocs,
  syncPutDocs,
  syncSwitchRequestDocs,
  syncStatusDocs,
} from './openapi'

/**
 * `POST /accounts/v1/account/register`: the account for a signing key, created
 * on first use. Self-signed, like `inbox/register`, and idempotent: the same
 * key always gets the same `accountId`, so a replay learns nothing new. It
 * counts against the register edge tier and the caller's daily quota. A key
 * a key change retired is 403 `key_retired` (ADR 0039).
 *
 * Opening a session (`POST /accounts/v1/sessions`) replaces it; it stays for
 * app versions before sessions, so it's refused with 426 `upgrade_required`
 * once the legacy switch is off.
 *
 * Privacy: nothing here logs or reports the body, the key, or the account id.
 */
const handleRegister = guarded('account/register', async (c) => {
  if (!c.env.ACCOUNTS_DB) return buddiesErrorResponse('disabled')
  const upgrade = await refuseLegacyAuth(c.env)
  if (upgrade) return upgrade
  const limited = await refuseAtEdge(c, 'inbox/register')
  if (limited) return limited

  const verified = await verifiedBody(c, 'account/register')
  if ('refusal' in verified) return verified.refusal
  const { payload } = verified

  // The caller's rolling-day registration quota, shared in kind with
  // Buddies' `inbox/register` (a DO per caller, under its own name).
  const callerKey = buddiesCallerKey(c.req.header('CF-Connecting-IP'))
  const refused = await refuseOverDailyQuota(
    c.env,
    await quotaName('register-caller', callerKey),
    undefined,
    'account/register',
    'registrationsPerDay'
  )
  if (refused) return refused

  const registered = await registerAccount(
    accountsDb(c.env.ACCOUNTS_DB),
    payload.accountPub,
    newAccountId
  )
  if ('retired' in registered) return keyRetiredResponse(registered.retired)
  const { account } = registered
  return c.json({ ok: true, accountId: account.id, status: account.status })
})

const infoResponse = (c: AppContext, info: AccountInfo | null): Response => {
  if (!info) return buddiesErrorResponse('unknown_account')
  const { id, ...rest } = info
  return c.json({ ok: true, accountId: id, ...rest })
}

/**
 * `GET /accounts/v1/account`: what the database holds for the bearer token's
 * own account, for Settings → Account and the developer tools. Read-only: it
 * never creates an account. Counts against the read edge tier. A caller
 * whose session has ended is 401 (`requireLiveSession`).
 *
 * Privacy: nothing here logs or reports the token or the account id.
 */
const handleAccount = guarded('account', async (c) => {
  const d1 = c.env.ACCOUNTS_DB
  if (!d1) return buddiesErrorResponse('disabled')
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return auth.response
  const { accountId } = auth.account
  return infoResponse(c, await findAccountInfo(accountsDb(d1), { accountId }))
})

/**
 * `POST /accounts/v1/account/info`: `GET /account`'s answer for app versions
 * before it. A bearer request with no body names the token's account; while
 * the legacy switch is on, an envelope self-signed by the account key names
 * the key's (an unknown key is 404 `unknown_account`). Read-only. Counts
 * against the read edge tier. A bearer caller whose session has ended is
 * 401, as on `GET /account`.
 *
 * Privacy: nothing here logs or reports the body, the key, or the account id.
 */
const handleInfo = guarded('account/info', async (c) => {
  const d1 = c.env.ACCOUNTS_DB
  if (!d1) return buddiesErrorResponse('disabled')
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  const db = accountsDb(d1)
  return bearerOrLegacy(
    c,
    {
      bearer: async ({ accountId }) =>
        infoResponse(c, await findAccountInfo(db, { accountId })),
      legacy: async () => {
        const verified = await verifiedBody(c, 'account/info')
        if ('refusal' in verified) return verified.refusal
        const { accountPub } = verified.payload
        return infoResponse(c, await findAccountInfo(db, { accountPub }))
      },
    },
    { requireLiveSession: true }
  )
})

/** Mounted at `/accounts/v1` by the Worker entry point. */
export const createAccountsRoutes = () => {
  const routes = new Hono<AppEnv>()
  // Sessions are resources. Backup and handoff stay `POST /{op}` (ids in
  // bodies, never URLs, as in Buddies); see their openapi.ts entries.
  routes.post('/sessions', sessionOpenDocs, sessionHandlers.open)
  routes.post('/sessions/refresh', sessionRefreshDocs, sessionHandlers.refresh)
  routes.delete('/sessions/current', sessionCloseDocs, sessionHandlers.close)
  routes.get('/sessions', sessionListDocs, sessionHandlers.list)
  // Ends another session; a POST so its id stays out of the URL.
  routes.post('/sessions/revoke', sessionRevokeDocs, sessionHandlers.revoke)
  routes.get('/account', accountDocs, handleAccount)
  routes.get('/activity', activityListDocs, handleActivity)
  // Supporter status (ADR 0029): link the app's RevenueCat customer, read it.
  routes.post('/revenuecat-customers', supporterLinkDocs, supporterHandlers.link)
  routes.get('/supporter', supporterStatusDocs, supporterHandlers.status)
  // App versions before sessions (and `GET /account`).
  routes.post('/account/register', accountRegisterDocs, handleRegister)
  routes.post('/account/info', accountInfoDocs, handleInfo)
  // Changing the account key (ADR 0039), and the history it leaves.
  routes.post('/account/rekey', accountRekeyDocs, rekeyHandlers.rekey)
  routes.get('/account/key-history', accountKeyHistoryDocs, rekeyHandlers.keyHistory)
  routes.post('/handoff/open', handoffOpenDocs, handoffHandlers.open)
  routes.post('/handoff/claim', handoffClaimDocs, handoffHandlers.claim)
  routes.post('/handoff/status', handoffStatusDocs, handoffHandlers.status)
  routes.post('/handoff/send', handoffSendDocs, handoffHandlers.send)
  routes.post('/handoff/receive', handoffReceiveDocs, handoffHandlers.receive)
  routes.post('/handoff/done', handoffDoneDocs, handoffHandlers.done)
  routes.post('/handoff/cancel', handoffCancelDocs, handoffHandlers.cancel)
  routes.post('/backup/put', backupPutDocs, backupHandlers.put)
  routes.post('/backup/list', backupListDocs, backupHandlers.list)
  routes.post('/backup/get', backupGetDocs, backupHandlers.get)
  routes.post('/backup/delete', backupDeleteDocs, backupHandlers.delete)
  // Cloud Sync (ADR 0030): the status is a resource; the ops stay
  // `POST /{op}` so slot ids travel in bodies and headers, never URLs.
  routes.get('/sync', syncStatusDocs, syncHandlers.status)
  routes.post('/sync/put', syncPutDocs, syncHandlers.put)
  routes.post('/sync/list', syncListDocs, syncHandlers.list)
  routes.post('/sync/get', syncGetDocs, syncHandlers.get)
  routes.post('/sync/delete', syncDeleteDocs, syncHandlers.delete)
  routes.post('/sync/changes/put', syncChangePutDocs, syncHandlers.changePut)
  routes.post('/sync/changes/list', syncChangesListDocs, syncHandlers.changesList)
  routes.post(
    '/sync/changes/reseal',
    syncChangeResealDocs,
    syncHandlers.changeReseal
  )
  routes.post('/sync/request', syncSwitchRequestDocs, syncHandlers.switchRequest)
  routes.get('/sync/live', syncLiveDocs, syncHandlers.live)
  routes.post('/sync/photos/put', syncPhotoPutDocs, syncPhotoHandlers.put)
  routes.post('/sync/photos/list', syncPhotoListDocs, syncPhotoHandlers.list)
  routes.post('/sync/photos/get', syncPhotoGetDocs, syncPhotoHandlers.get)
  routes.post('/sync/photos/delete', syncPhotoDeleteDocs, syncPhotoHandlers.delete)
  routes.get('/sync/photos/usage', syncPhotoUsageDocs, syncPhotoHandlers.usage)
  // Passkeys (ADR 0038): the collection is a resource; the ceremonies and
  // removal are POSTs so credential ids stay out of URLs.
  routes.post('/passkeys/challenge', passkeyChallengeDocs, passkeyHandlers.challenge)
  routes.post('/passkeys/assert', passkeyAssertDocs, passkeyHandlers.assert)
  routes.post(
    '/passkeys/register/options',
    passkeyRegisterOptionsDocs,
    passkeyHandlers.registerOptions
  )
  routes.post('/passkeys', passkeyAddDocs, passkeyHandlers.add)
  routes.post('/passkeys/wrap', passkeyWrapDocs, passkeyHandlers.wrap)
  routes.get('/passkeys', passkeyListDocs, passkeyHandlers.list)
  routes.post('/passkeys/remove', passkeyRemoveDocs, passkeyHandlers.remove)
  // Accounts on the web: sign-up behind Turnstile and caps, and a recovery
  // key's ticket.
  routes.post('/web/signup/options', webSignupOptionsDocs, webHandlers.signupOptions)
  routes.post('/web/signup', webSignupDocs, webHandlers.signup)
  routes.post('/web/recovery', webRecoveryDocs, webHandlers.recovery)
  // Approving a browser from a phone: the handoff with the roles turned
  // around, `POST /approval/{op}` like it.
  routes.post('/approval/open', approvalOpenDocs, approvalHandlers.open)
  routes.post('/approval/claim', approvalClaimDocs, approvalHandlers.claim)
  routes.post('/approval/status', approvalStatusDocs, approvalHandlers.status)
  routes.post('/approval/send', approvalSendDocs, approvalHandlers.send)
  routes.post('/approval/receive', approvalReceiveDocs, approvalHandlers.receive)
  routes.post('/approval/done', approvalDoneDocs, approvalHandlers.done)
  routes.post('/approval/cancel', approvalCancelDocs, approvalHandlers.cancel)
  // A browser's ticket onto a live socket (`sync/live`, Buddies' `inbox/live`).
  routes.post('/live/ticket', liveTicketDocs, handleLiveTicket)
  return routes
}
