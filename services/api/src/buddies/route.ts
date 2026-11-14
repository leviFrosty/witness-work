import { Hono } from 'hono'
import type { AppContext, AppEnv, Environment } from '../types'
import { captureFailure } from '../sentry'
import { bytesToBase64Url, sha256Bytes } from '../crypto'
import {
  BUDDIES_ALWAYS_ALLOWED_OPS,
  BUDDIES_BLOB_GET_OP,
  BUDDIES_BLOB_PUT_OP,
  BUDDIES_CLIENT_HEADER,
  BUDDIES_FIELD_PARSERS,
  BUDDIES_LIMITS,
  BUDDIES_ENVELOPE_HEADERS,
  BUDDIES_LIVE_ACCOUNT_HEADER,
  BUDDIES_LIVE_EXPIRES_HEADER,
  BUDDIES_LIVE_OP,
  BUDDIES_NOTIFICATION_SERVICE_CLIENT,
  BUDDIES_OPS,
  BUDDIES_OWNER_OPS,
  BUDDIES_PAYLOAD_PARSERS,
  BUDDIES_PHOTO_OPS,
  BUDDIES_SUCCESSOR_OP,
  BUDDIES_SUSPENDED_REFUSED_OPS,
  BUDDIES_UNSIGNED_OPS,
  buddyBlobKey,
  fail,
  isPlainObject,
  ok,
  type BlobPutPayload,
  type BuddiesErrorCode,
  type BuddiesFailure,
  type BuddiesOp,
  type BuddiesOwnerOp,
  type BuddiesPayloads,
  type BuddiesResult,
  type BuddiesRouteOp,
  type BuddiesSignedOp,
  type BuddiesUnsignedOp,
  type OwnerCall,
  type PushJob,
  type Signed,
  type SyncPayload,
} from './contracts'
import {
  isEnvelopeBody,
  isWebSocketUpgrade,
  parseEnvelope,
  readBlobBody,
  readBlobPutCall,
  readEnvelopeText,
  readHeaderFields,
  readLiveCall,
  signedCall,
  verifyBuddiesSignature,
  verifyEd25519,
  type Envelope,
} from './envelope'
import { inboxLinkMessage } from '../accounts/contracts'
import {
  accountsDb,
  confirmInboxLink,
  findAccount,
  findInboxAccount,
  linkInbox,
} from '../accounts/store'
import { liveSessionKeyEpoch } from '../accounts/sessionStore'
import {
  findInboxSuccessor,
  findSuccessorAccount,
  forgetInboxSuccessor,
  isOldKeyLink,
  recordInboxSuccessor,
  unlinkReplacedInbox,
} from '../accounts/inboxSuccessors'
import {
  authenticateAccount,
  hasAuthorization,
  parseJsonOrNull,
  refuseInactiveAccount,
  type AccountAuth,
} from '../accounts/auth'
import {
  isLegacyAuthEnabled,
  upgradeRequiredResponse,
} from '../accounts/legacySwitch'
import { recordActivity } from '../accounts/activity'
import { isBuddiesEnabled, isBuddiesPhotosEnabled } from './killSwitch'
import { buddiesErrorResponse, buddiesInternalError } from './errorResponse'
import {
  acceptLiveSubprotocol,
  forwardedLiveRequest,
  readBrowserLive,
  LIVE_TICKET_HEADER,
} from '../liveSubprotocol'
import { admitLiveTicket, type LiveTicketClaims } from '../accounts/liveTickets'
import {
  EDGE_RETRY_AFTER_SECONDS,
  allowBuddiesCaller,
  buddiesAccountCallerKey,
  buddiesCallerKey,
  logLimitHit,
} from './limits'
import { defaultApnsDependencies } from '../apns'
import { deliverPushJob, type PushDependencies } from './push'
import {
  buddiesBlobGetDocs,
  buddiesBlobPutDocs,
  buddiesLiveDocs,
  buddiesOpDocs,
  buddiesSuccessorDocs,
} from './openapi'

/**
 * `POST /buddies/v1/{op}` — the Buddies relay (docs/buddies-protocol.md) —
 * `GET /buddies/v1/inbox/live`, the owner's live socket, and the photo blob
 * routes `POST /buddies/v1/blob/put` (raw body) and `blob/get` (raw answer),
 * and `POST /buddies/v1/inbox/successor`, a bearer read.
 *
 * Authentication (witness-work ADR 0027, "Authentication (sessions)" in the
 * protocol): a request with an `Authorization` header is a bearer request.
 * Its access token must verify (401 `unauthorized` otherwise, never a
 * fallback). Owner ops then send plain JSON fields (`inbox/live` and
 * `blob/put` in `x-buddies-payload`), authorized by the inbox DO against the
 * account the inbox is linked to; `inbox/register` still sends its
 * self-signed envelope, whose `account` proof must name the token's account;
 * writer ops send their writer-signed envelope (the slot capability, never
 * compared with the token's account, though a suspended account's writes and
 * invite claims are refused); invite and blob reads send today's body. A request without the header is a legacy request, served as before
 * sessions while the legacy switch is on, 426 `upgrade_required` once it's
 * off, except the iOS Notification Service Extension's owner-signed
 * `inbox/sync` for an inbox with a confirmed account link (`admitCaller`).
 * An owner-signed request on an inbox first linked before its account's key
 * changed is 401 `unauthorized`, `reason: "key_changed"` (`ownedByOldKey`).
 *
 * Privacy: every id travels in the body (or, for the live socket, in headers),
 * and nothing here logs or reports the body, headers, payload, token, or any
 * value from them. Errors are `{ "ok": false, "error": "<code>", "code":
 * "<code>" }` (src/buddies/errorResponse.ts).
 *
 * Abuse limits (src/buddies/limits.ts): every request first counts against its
 * op tier's per-caller limit, keyed on the session's account for a bearer
 * request (hashed), else the client IP (IPv6 by /64), never on the target
 * inbox. Malformed, stale, and (for `inbox/register`) badly signed requests
 * are refused here, before any Durable Object wakes.
 */

export interface BuddiesRouteDependencies {
  /** APNs, FCM, and Google OAuth requests. */
  push: PushDependencies
}

interface OpOutcome {
  body: Record<string, unknown>
  push?: PushJob | null
}

/**
 * A failure may say how long to wait (`Retry-After`), and an `unauthorized`
 * one why (`reason`).
 */
type Refusal = BuddiesFailure & { reason?: 'key_changed' }
type Outcome = { ok: true; value: OpOutcome } | Refusal

const inbox = (env: Environment, inboxId: string) =>
  env.BUDDY_INBOX.get(env.BUDDY_INBOX.idFromName(inboxId))

const invite = (env: Environment, inviteId: string) =>
  env.BUDDY_INVITE.get(env.BUDDY_INVITE.idFromName(inviteId))

const empty = (result: BuddiesResult<unknown>): Outcome =>
  result.ok ? ok({ body: {} }) : result

const withSeq = (result: BuddiesResult<{ seq: number }>): Outcome =>
  result.ok ? ok({ body: { seq: result.value.seq } }) : result

/**
 * Photo blobs work only with the `buddies:photos` switch on and an R2 bucket
 * bound. Callers check Buddies' own switch first.
 */
const photosAvailable = async (env: Environment): Promise<boolean> =>
  env.BUDDY_BLOBS != null && (await isBuddiesPhotosEnabled(env))

/**
 * Who's calling: the key the per-caller limits count against, and, for a
 * bearer request, the session's account.
 */
interface Caller {
  key: string
  account: AccountAuth | null
  /** A bearer caller's token expiry, epoch ms; null for a legacy one. */
  expiresAt: number | null
  /**
   * A legacy request admitted while the legacy switch is off: only the
   * Notification Service Extension's `inbox/sync`, which the inbox serves
   * only with a confirmed account link.
   */
  linkedOnly: boolean
}

type Admission = { ok: true; caller: Caller } | { ok: false; response: Response }

/**
 * Sorts a request into bearer or legacy and counts it against its op's
 * per-caller edge tier. A bearer request's token must verify (401
 * `unauthorized`, or 503 `disabled` on a worker without sessions), and it
 * counts against its account. A legacy request is refused with 426
 * `upgrade_required` once the legacy switch is off, and otherwise counts
 * against the client IP.
 *
 * A bearer request for an op that reaches someone else's inbox
 * (`BUDDIES_SUSPENDED_REFUSED_OPS`: writing to a buddy, claiming an invite)
 * is then refused with 403 `suspended` when the token's account is
 * suspended, from the cached account status, so the target inbox never
 * learns which account wrote. Other ops leave suspension to the account's
 * own inbox (its copy of the status), as before sessions.
 *
 * One legacy request outlives the switch: `inbox/sync` from the iOS
 * Notification Service Extension (`x-buddies-client: notification-service`),
 * which fetches events too big for a push and can't hold the session's
 * rotating refresh token without racing the app. It's admitted as
 * `linkedOnly`: the inbox still checks the owner signature, `ts`, nonce, and
 * suspension, and answers 426 unless its account link is confirmed, so it
 * serves only inboxes whose owner has moved to sessions.
 */
const admitCaller = async (
  c: AppContext,
  op: BuddiesRouteOp,
  /** A browser socket's verified ticket, in place of the token; always bearer. */
  ticket?: LiveTicketClaims
): Promise<Admission> => {
  let caller: Caller
  if (ticket || hasAuthorization(c)) {
    const auth = ticket
      ? ({
          ok: true,
          account: ticket.account,
          expiresAt: ticket.tokenExpiresAt,
        } as const)
      : await authenticateAccount(c)
    if (!auth.ok) return auth
    const key = await buddiesAccountCallerKey(auth.account.accountId)
    caller = {
      key,
      account: auth.account,
      expiresAt: auth.expiresAt,
      linkedOnly: false,
    }
  } else {
    const legacy = await isLegacyAuthEnabled(c.env)
    if (!legacy && !isNotificationServiceSync(c, op))
      return { ok: false, response: upgradeRequiredResponse() }
    caller = {
      key: buddiesCallerKey(c.req.header('CF-Connecting-IP')),
      account: null,
      expiresAt: null,
      linkedOnly: !legacy,
    }
  }
  if (!(await allowBuddiesCaller(c.env, op, caller.key)))
    return { ok: false, response: edgeLimited() }
  if (caller.account && BUDDIES_SUSPENDED_REFUSED_OPS.has(op)) {
    const refused = await refuseInactiveAccount(c.env, caller.account)
    if (refused) return refused
  }
  return { ok: true, caller }
}

/**
 * An owner-signed (legacy) owner op, `inbox/live`, or `blob/put` on an inbox
 * first linked to its account at a key epoch below the account's current
 * one: 401 `unauthorized`, `reason: "key_changed"` (witness-work ADR 0039),
 * for good. An inbox's owner key comes from the account key it was linked
 * under, so after a key change whoever holds the old key could otherwise keep
 * reading the User's old inbox (or acting as its owner) until the User's
 * device deletes it, which a lost device never does. Registering the inbox
 * again with the new key's proof moves its link up for successors only: the
 * owner key is still the old one's. The old inbox is left to bearer owner
 * ops, with which the User's device deletes it with a successor. With the
 * legacy switch on or off, the Notification Service Extension's
 * `linkedOnly` sync included; a legacy `inbox/register` is refused too
 * (`checkInboxAccount`).
 *
 * Checked after the request's shape and `ts`, before the inbox wakes, so
 * nothing in the inbox changes (no nonce is spent). The Worker can't check
 * the owner signature (the inbox holds the owner key), so anyone who knows
 * the inbox id learns that it predates a key change; buddies learn that
 * anyway from the reconnect. Inboxes without a link (registered before
 * accounts) and workers without the accounts database are unchanged. Bearer
 * owner ops are left to the session rules.
 *
 * One indexed accounts database read per request, never cached: a cached
 * answer could re-admit the old key after a change. If the read fails the
 * request fails (500), rather than serving the old key.
 */
const ownedByOldKey = async (
  env: Environment,
  inboxId: string
): Promise<boolean> =>
  env.ACCOUNTS_DB != null &&
  (await isOldKeyLink(accountsDb(env.ACCOUNTS_DB), inboxId))

const KEY_CHANGED = {
  ok: false,
  error: 'unauthorized',
  reason: 'key_changed',
} as const satisfies Outcome

/** The Notification Service Extension's `inbox/sync` (see `admitCaller`). */
const isNotificationServiceSync = (c: AppContext, op: BuddiesRouteOp) =>
  op === 'inbox/sync' &&
  c.req.header(BUDDIES_CLIENT_HEADER) === BUDDIES_NOTIFICATION_SERVICE_CLIENT

type OwnerRunners = {
  [K in BuddiesOwnerOp]: (
    env: Environment,
    call: OwnerCall<BuddiesPayloads[K]>
  ) => Promise<Outcome>
}

type SignedRunners = {
  [K in BuddiesSignedOp]: (
    env: Environment,
    call: Signed<BuddiesPayloads[K]>,
    account: AccountAuth | null
  ) => Promise<Outcome>
}

/** The accounts side of `inbox/register`; see `registerInbox`. */
type InboxAccount =
  | {
      ok: true
      linked: string | null
      claim: string | null
      /** The key epoch of the key that verified the proof; null without one. */
      keyEpoch: number | null
    }
  | Refusal

/**
 * Checks `inbox/register` against the accounts database (witness-work ADR
 * 0024). `linked` is the account the inbox already belongs to; `claim` is the
 * account a valid proof names, when the inbox isn't linked yet. A suspended
 * account's inbox is refused, with or without a proof, and so is an inbox
 * with a successor recorded (`conflict`). `keyEpoch` is the
 * account's epoch as read with the key that verified the proof (ADR 0039).
 *
 * A legacy registration of an inbox first linked before its account's key
 * changed is `key_changed`, proof or not (`ownedByOldKey`): it would only
 * keep the old key's inbox from ageing out. A bearer one goes ahead, so the
 * User's device can still move the link up.
 */
const checkInboxAccount = async (
  db: ReturnType<typeof accountsDb>,
  call: Signed<BuddiesPayloads['inbox/register']>,
  bearer: boolean
): Promise<InboxAccount> => {
  // A replaced inbox (ADR 0039 §5) is never registered again.
  if (await findSuccessorAccount(db, call.inboxId)) return fail('conflict')
  if (!bearer && (await isOldKeyLink(db, call.inboxId))) return KEY_CHANGED
  const linked = await findInboxAccount(db, call.inboxId)
  if (linked?.status === 'suspended') return fail('suspended')
  if (!call.account)
    return { ok: true, linked: linked?.id ?? null, claim: null, keyEpoch: null }
  const account = await findAccount(db, call.account.accountId)
  if (!account) return fail('unknown_account')
  const valid = await verifyEd25519(
    account.accountPub,
    inboxLinkMessage(account.id, call.inboxId, call.ownerPub),
    call.account.signature
  )
  if (!valid) return fail('bad_signature')
  if (linked && linked.id !== account.id) return fail('conflict')
  if (account.status === 'suspended') return fail('suspended')
  const { keyEpoch } = account
  return linked
    ? { ok: true, linked: linked.id, claim: null, keyEpoch }
    : { ok: true, linked: null, claim: account.id, keyEpoch }
}

/**
 * A bearer `inbox/register` links the inbox to the token's own account: its
 * `account` proof is required (`bad_request`) and must name that account
 * (`forbidden`). Checked before the signature and quota.
 */
const refuseBearerRegistration = (
  call: Signed<BuddiesPayloads['inbox/register']>,
  account: AccountAuth | null
): BuddiesFailure | null => {
  if (!account) return null
  if (!call.account) return fail('bad_request')
  return call.account.accountId === account.accountId ? null : fail('forbidden')
}

/**
 * `inbox/register`, linking the inbox to the account its proof names. The link
 * is written only after the inbox accepted the owner-signed registration, so it
 * takes both the owner key and the account key. The answer carries `accountId`
 * once the inbox belongs to an account. Without the accounts database (or while
 * it fails) a legacy registration works as before accounts, without links; a
 * bearer one, which exists to link the inbox, answers `disabled` (or fails
 * with 500) instead, so the app retries.
 *
 * The inbox lets bearer requests act as the owner only for a link the
 * accounts database holds, where moderation finds it: an existing link goes
 * along with the registration, and a new one is confirmed in the inbox once
 * the database has written it, naming the database's winner (another
 * account's claim may have won: `conflict`). If either step fails, the inbox
 * keeps answering bearer owner requests `not_linked` until a registration
 * gets through; registering again is idempotent.
 *
 * The link records the key epoch of the key that signed its proof, and a
 * later proof by a newer key moves an existing link up to that epoch: only a
 * link at the account's current epoch can be an inbox's successor (ADR 0039
 * §5), so a link the old key made can't be one after a key change.
 */
const registerInbox = async (
  env: Environment,
  call: Signed<BuddiesPayloads['inbox/register']>,
  account: AccountAuth | null
): Promise<Outcome> => {
  const db = env.ACCOUNTS_DB ? accountsDb(env.ACCOUNTS_DB) : null
  if (account && !db) return fail('disabled')
  let check: InboxAccount = {
    ok: true,
    linked: null,
    claim: null,
    keyEpoch: null,
  }
  if (db) {
    try {
      check = await checkInboxAccount(db, call, account != null)
    } catch (error) {
      if (account) throw error
      console.warn('buddies: accounts database unavailable; registering unlinked')
      captureFailure(error, 'inbox/register')
    }
  }
  if (!check.ok) return check
  const stub = inbox(env, call.inboxId)
  const result = await stub.register(call, check.linked)
  if (!result.ok) return result
  if (db && check.linked && check.keyEpoch != null) {
    try {
      await confirmInboxLink(db, call.inboxId, check.linked, check.keyEpoch)
    } catch (error) {
      if (account) throw error
      console.warn('buddies: confirming an inbox link failed')
      captureFailure(error, 'inbox/register')
    }
  }
  if (db && check.claim && check.keyEpoch != null) {
    let owner
    try {
      owner = await linkInbox(
        db,
        call.inboxId,
        check.claim,
        check.keyEpoch,
        account?.sessionId ?? null
      )
    } catch (error) {
      if (account) throw error
      console.warn('buddies: linking an inbox failed')
      captureFailure(error, 'inbox/register')
      return ok({ body: {} })
    }
    await stub.confirmAccount(owner.id, owner.status === 'suspended')
    if (owner.id !== check.claim) return fail('conflict')
  }
  const accountId = check.linked ?? check.claim
  return ok({ body: accountId ? { accountId } : {} })
}

/**
 * `inbox/sync`. `linkedOnly`: a legacy one admitted after the legacy switch
 * went off (`admitCaller`), served only for an inbox with a confirmed account
 * link. `capabilities` tells the app which optional relay features it may use.
 */
const syncInbox = async (
  env: Environment,
  call: OwnerCall<SyncPayload>,
  linkedOnly = false
): Promise<Outcome> => {
  const result = await inbox(env, call.inboxId).sync(call, { linkedOnly })
  if (!result.ok) return result
  const capabilities = { photos: await photosAvailable(env) }
  return ok({ body: { ...result.value, capabilities } })
}

/** Owner ops, signed (legacy) or by the bearer token's account. */
const OWNER_OPS: OwnerRunners = {
  'inbox/sync': (env, call) => syncInbox(env, call),
  'inbox/delete': async (env, call) =>
    empty(await inbox(env, call.inboxId).deleteInbox(call)),
  'device/register': async (env, call) =>
    empty(await inbox(env, call.inboxId).registerDevice(call)),
  'device/unregister': async (env, call) =>
    empty(await inbox(env, call.inboxId).unregisterDevice(call)),
  'slot/add': async (env, call) =>
    empty(await inbox(env, call.inboxId).addSlot(call)),
  'slot/remove': async (env, call) =>
    empty(await inbox(env, call.inboxId).removeSlot(call)),
  'roster/put': async (env, call) =>
    withSeq(await inbox(env, call.inboxId).putRoster(call)),
  'invite/create': async (env, call) =>
    empty(await inbox(env, call.inboxId).createInvite(call)),
  'invite/delete': async (env, call) =>
    empty(await inbox(env, call.inboxId).deleteInvite(call)),
  'blob/delete': async (env, call) =>
    empty(await inbox(env, call.inboxId).deleteBlobs(call)),
}

const SIGNED_OPS: SignedRunners = {
  'inbox/register': registerInbox,
  ...OWNER_OPS,
  'card/put': async (env, call) =>
    withSeq(await inbox(env, call.inboxId).putCard(call)),
  'event/put': async (env, call) => {
    const result = await inbox(env, call.inboxId).putEvent(call)
    return result.ok
      ? ok({ body: { seq: result.value.seq }, push: result.value.push })
      : result
  },
  'slot/leave': async (env, call) =>
    empty(await inbox(env, call.inboxId).leaveSlot(call)),
  'slot/seal': async (env, call) =>
    empty(await inbox(env, call.inboxId).sealSlot(call)),
}

type UnsignedRunners = {
  [K in BuddiesUnsignedOp]: (
    env: Environment,
    payload: BuddiesPayloads[K]
  ) => Promise<Outcome>
}

const UNSIGNED_OPS: UnsignedRunners = {
  'invite/fetch': async (env, payload) => {
    const result = await invite(env, payload.inviteId).read(payload.inviteId)
    return result.ok ? ok({ body: { ...result.value } }) : result
  },
  'invite/claim': async (env, payload) => {
    // Only the hash crosses into the DO; it's compared in constant time there.
    const claimHash = bytesToBase64Url(await sha256Bytes(payload.claimSecret))
    const result = await invite(env, payload.inviteId).claim({
      inviteId: payload.inviteId,
      claimHash,
      blob: payload.blob,
    })
    return result.ok ? ok({ body: {}, push: result.value.push }) : result
  },
}

const isUnsignedOp = (op: BuddiesOp): op is BuddiesUnsignedOp =>
  (BUDDIES_UNSIGNED_OPS as readonly BuddiesOp[]).includes(op)

const isOwnerOp = (op: BuddiesOp): op is BuddiesOwnerOp =>
  (BUDDIES_OWNER_OPS as readonly BuddiesOp[]).includes(op)

/** The inbox DO checks this too; here it spares a wake-up. */
const isStale = (ts: number, now: number): boolean =>
  Math.abs(now - ts) > BUDDIES_LIMITS.timestampSkewMs

const registrationQuotaName = async (callerKey: string): Promise<string> =>
  bytesToBase64Url(
    await sha256Bytes(
      new TextEncoder().encode(`ww-buddies/v1/register-caller\n${callerKey}`)
    )
  )

/**
 * Gates `inbox/register` before the inbox DO: the self-signature (checkable
 * without the inbox, so junk never wakes a DO or spends quota), then the
 * caller's rolling-day registration quota. The DO stays the authority on the
 * signature; a quota outage lets registrations through.
 */
const admitRegistration = async (
  env: Environment,
  call: Signed<BuddiesPayloads['inbox/register']>,
  callerKey: string
): Promise<Outcome | null> => {
  const valid = await verifyBuddiesSignature(
    call.ownerPub,
    'inbox/register',
    call.payloadBytes,
    call.signature
  )
  if (!valid) return { ok: false, error: 'bad_signature' }
  let admission
  try {
    const name = await registrationQuotaName(callerKey)
    const quota = env.BUDDY_REGISTRATION_QUOTA
    admission = await quota.get(quota.idFromName(name)).admit(Date.now())
  } catch (error) {
    console.warn('buddies: registration quota unavailable; allowing')
    captureFailure(error, 'inbox/register')
    return null
  }
  if (admission.ok) return null
  logLimitHit('inbox/register', 'registrationsPerDay')
  return {
    ok: false,
    error: 'rate_limited',
    retryAfterSeconds: admission.retryAfterSeconds,
  }
}

/**
 * `buddies.deleted` in the account's activity (witness-work ADR 0028), once
 * the inbox accepted `inbox/delete`: for a bearer request the token's account
 * and session (the inbox checked it owns the inbox), for a legacy one the
 * account the inbox is linked to, if any. Recorded here, never in the inbox
 * DO, and only for the owner's own inbox: writer ops log nothing. A failed
 * write is reported; the deletion already happened.
 */
const recordBuddiesDeleted = async (
  env: Environment,
  inboxId: string,
  account: AccountAuth | null
): Promise<void> => {
  if (!env.ACCOUNTS_DB) return
  try {
    const db = accountsDb(env.ACCOUNTS_DB)
    const accountId =
      account?.accountId ?? (await findInboxAccount(db, inboxId))?.id
    if (!accountId) return
    await recordActivity(db, {
      accountId,
      kind: 'buddies.deleted',
      sessionId: account?.sessionId ?? null,
    })
  } catch (error) {
    console.error('buddies: activity write failed', { op: 'inbox/delete' })
    captureFailure(error, 'inbox/delete')
  }
}

const runSigned = async <K extends BuddiesSignedOp>(
  op: K,
  env: Environment,
  envelope: Envelope,
  caller: Caller
): Promise<Outcome> => {
  const now = Date.now()
  const call = signedCall(op, envelope, now)
  if (!call.ok) return call
  if (isStale(call.value.ts, now)) return { ok: false, error: 'stale' }
  if (
    !caller.account &&
    isOwnerOp(op) &&
    (await ownedByOldKey(env, call.value.inboxId))
  )
    return KEY_CHANGED
  if (caller.linkedOnly) {
    // `admitCaller` lets only `inbox/sync` through this way.
    if (op !== 'inbox/sync') return fail('upgrade_required')
    const sync = call.value as unknown as Signed<SyncPayload>
    return syncInbox(env, sync, true)
  }
  // A successor is recorded for a bearer session of the inbox's account only.
  if (op === 'inbox/delete' && 'successor' in call.value)
    return fail('forbidden')
  if (op === 'inbox/register') {
    const register = call.value as unknown as Signed<
      BuddiesPayloads['inbox/register']
    >
    const refused =
      refuseBearerRegistration(register, caller.account) ??
      (await admitRegistration(env, register, caller.key))
    if (refused) return refused
  }
  const outcome = await SIGNED_OPS[op](env, call.value, caller.account)
  if (op === 'inbox/delete' && outcome.ok)
    await recordBuddiesDeleted(env, call.value.inboxId, null)
  return outcome
}

/**
 * A bearer `inbox/delete` naming `successor`, the inbox that replaces this one
 * after a key change (witness-work ADR 0039 §5). The inbox must be the token's
 * account's: linked to it, or, once deleted and unlinked, replaced by it
 * (`forbidden`). The account must not be suspended (`suspended`; deleting
 * without a successor still works), and the token's session must still be
 * live at the account's key epoch (`unauthorized`: a key change ends every
 * other session, though their access tokens verify for minutes more).
 *
 * The successor must be registered (not deleted or wiped), another inbox
 * linked to the same account at its current key epoch, and not replaced
 * itself (no cycles), else `conflict` and nothing is deleted; so is naming
 * another successor than one already recorded that still qualifies (one
 * that doesn't, from before a key change, is replaced). It's recorded before
 * the inbox is deleted; if the inbox refuses, or the call to it throws, the
 * record goes too. Once the inbox is gone its link is dropped: a replaced
 * inbox is never registered again (`registerInbox`). A repeat answers `ok`
 * once the inbox is gone (`not_found` from the inbox), refreshing the
 * record; `buddies.deleted` is logged only for the deletion itself.
 */
const deleteWithSuccessor = async (
  env: Environment,
  inboxId: string,
  successorId: string,
  account: AccountAuth
): Promise<Outcome> => {
  if (!env.ACCOUNTS_DB) return fail('disabled')
  const db = accountsDb(env.ACCOUNTS_DB)
  const linked = await findInboxAccount(db, inboxId)
  const ownerId = linked?.id ?? (await findSuccessorAccount(db, inboxId))
  if (ownerId !== account.accountId) return fail('forbidden')
  const owner = linked ?? (await findAccount(db, ownerId))
  if (!owner) return fail('forbidden')
  if (owner.status === 'suspended') return fail('suspended')
  const sessionEpoch = await liveSessionKeyEpoch(
    db,
    account.accountId,
    account.sessionId
  )
  if (sessionEpoch !== owner.keyEpoch) return fail('unauthorized')
  if (!(await inbox(env, successorId).isRegistered(successorId)))
    return fail('conflict')
  const now = Date.now()
  const recorded = await recordInboxSuccessor(db, {
    inboxId,
    successorId,
    accountId: account.accountId,
    sessionId: account.sessionId,
    now,
  })
  if (!recorded) return fail('conflict')
  let result: BuddiesResult<unknown>
  try {
    result = await inbox(env, inboxId).deleteInbox({
      inboxId,
      accountId: account.accountId,
    })
  } catch (error) {
    // A retry records it again, and answers `ok` if the inbox did go.
    await forgetInboxSuccessor(db, inboxId, successorId, now)
    throw error
  }
  if (!result.ok && result.error !== 'not_found') {
    await forgetInboxSuccessor(db, inboxId, successorId, now)
    return result
  }
  await unlinkReplacedInbox(db, inboxId, account.accountId)
  if (result.ok) await recordBuddiesDeleted(env, inboxId, account)
  return ok({ body: {} })
}

/**
 * A bearer owner op: the payload's fields as plain JSON, without `ts` and
 * `nonce` (ignored if sent), on behalf of the token's account. An envelope
 * (`payload`/`signature`) is `bad_request`: bearer requests aren't signed.
 */
const runByAccount = async <K extends BuddiesOwnerOp>(
  op: K,
  env: Environment,
  text: string,
  account: AccountAuth
): Promise<Outcome> => {
  const body = parseJsonOrNull(text)
  if (!isPlainObject(body) || isEnvelopeBody(body)) return fail('bad_request')
  const fields = BUDDIES_FIELD_PARSERS[op](body, Date.now())
  if (!fields) return fail('bad_request')
  if (
    op === 'inbox/delete' &&
    'successor' in fields &&
    typeof fields.successor === 'string'
  )
    return deleteWithSuccessor(env, fields.inboxId, fields.successor, account)
  const outcome = await OWNER_OPS[op](env, {
    ...fields,
    accountId: account.accountId,
  })
  if (op === 'inbox/delete' && outcome.ok)
    await recordBuddiesDeleted(env, fields.inboxId, account)
  return outcome
}

const runUnsigned = async <K extends BuddiesUnsignedOp>(
  op: K,
  env: Environment,
  envelope: Envelope
): Promise<Outcome> => {
  const payload = BUDDIES_PAYLOAD_PARSERS[op](envelope.payload, Date.now())
  if (!payload) return { ok: false, error: 'bad_request' }
  return UNSIGNED_OPS[op](env, payload)
}

const errorResponse = (
  error: BuddiesErrorCode,
  retryAfterSeconds?: number,
  reason?: string
): Response =>
  buddiesErrorResponse(error, {
    retryAfterSeconds,
    extras: reason ? { reason } : undefined,
  })

const keyChanged = (): Response =>
  errorResponse(KEY_CHANGED.error, undefined, KEY_CHANGED.reason)

/** A per-caller edge limit refused the request. */
const edgeLimited = (): Response =>
  errorResponse('rate_limited', EDGE_RETRY_AFTER_SECONDS)

const handleBuddiesOp = async (
  c: AppContext,
  op: BuddiesOp,
  deps: BuddiesRouteDependencies
): Promise<Response> => {
  try {
    if (
      !BUDDIES_ALWAYS_ALLOWED_OPS.has(op) &&
      !(await isBuddiesEnabled(c.env))
    ) {
      return errorResponse('disabled')
    }
    if (BUDDIES_PHOTO_OPS.has(op) && !(await photosAvailable(c.env)))
      return errorResponse('photos_disabled')
    const admission = await admitCaller(c, op)
    if (!admission.ok) return admission.response
    const { caller } = admission

    const text = await readEnvelopeText(c.req.raw)
    if (text == null) return errorResponse('bad_request')
    let result: Outcome
    if (caller.account && isOwnerOp(op)) {
      result = await runByAccount(op, c.env, text, caller.account)
    } else {
      const envelope = parseEnvelope(text)
      if (!envelope) return errorResponse('bad_request')
      result = isUnsignedOp(op)
        ? await runUnsigned(op, c.env, envelope)
        : await runSigned(op, c.env, envelope, caller)
    }
    if (!result.ok)
      return errorResponse(result.error, result.retryAfterSeconds, result.reason)

    const { body, push } = result.value
    if (push) c.executionCtx.waitUntil(deliverPushJob(c.env, push, deps.push))
    return c.json({ ok: true, ...body })
  } catch (error) {
    // Report the failure, never the request: bodies hold ids, keys, and blobs.
    console.error('buddies: request failed', { op })
    captureFailure(error, op)
    return buddiesInternalError()
  }
}

/**
 * The upgrade as the inbox DO gets it. A bearer one names the token's account
 * in `BUDDIES_LIVE_ACCOUNT_HEADER`, which the DO trusts; any copy a client
 * sent is dropped, so a legacy upgrade never carries one. Nor does any
 * native upgrade carry `BUDDIES_LIVE_EXPIRES_HEADER` or `LIVE_TICKET_HEADER`:
 * only browser sockets close when their token expires, or hold a ticket.
 */
const liveRequest = (request: Request, account: AccountAuth | null): Request => {
  if (
    !account &&
    !request.headers.has(BUDDIES_LIVE_ACCOUNT_HEADER) &&
    !request.headers.has(BUDDIES_LIVE_EXPIRES_HEADER) &&
    !request.headers.has(LIVE_TICKET_HEADER)
  )
    return request
  const headers = new Headers(request.headers)
  headers.delete(BUDDIES_LIVE_ACCOUNT_HEADER)
  headers.delete(BUDDIES_LIVE_EXPIRES_HEADER)
  headers.delete(LIVE_TICKET_HEADER)
  if (account) headers.set(BUDDIES_LIVE_ACCOUNT_HEADER, account.accountId)
  return new Request(request, { headers })
}

/** A bearer `inbox/live`'s `x-buddies-payload`: b64u(UTF-8 JSON `{ inboxId }`). */
const encodeLiveFields = (inboxId: string): string =>
  bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ inboxId })))

/**
 * Upgrades to the owner's live socket. A WebSocket upgrade has no body (and
 * ids never go in URLs), so the request rides in headers: the fields in
 * `x-buddies-payload`, plus `x-buddies-signature` for a legacy (owner-signed)
 * upgrade. The Worker counts it as a read and checks its shape (and a legacy
 * one's `ts`) to find the inbox; the inbox DO authenticates it and accepts
 * the socket.
 *
 * A browser can't set headers on a WebSocket, so it offers `ww.v1` and
 * `ticket.<ticket>` in `Sec-WebSocket-Protocol` (src/liveSubprotocol.ts),
 * from an allowed `Origin`: a `buddies` ticket from `POST
 * /accounts/v1/live/ticket` (src/accounts/liveTickets.ts), which names the
 * inbox. Origin (403) and the offer's shape (400) come first, then the
 * kill switch and the ticket (401); that's always a bearer upgrade, the
 * ticket standing in for the token, checked like one in the same order. The
 * DO gets the inbox in `x-buddies-payload`, the token's expiry from the
 * ticket in `BUDDIES_LIVE_EXPIRES_HEADER`, and the ticket's hash in
 * `LIVE_TICKET_HEADER` (never the ticket); it refuses a second socket on the
 * same ticket while one is open (409 `conflict`), and closes the socket with
 * `4004 "expired"` at the expiry; the 101 says `Sec-WebSocket-Protocol:
 * ww.v1`.
 */
const handleLive = async (c: AppContext): Promise<Response> => {
  try {
    const browser = readBrowserLive(c.env, c.req.raw.headers)
    if (browser && !browser.ok) return errorResponse(browser.error)
    if (!(await isBuddiesEnabled(c.env))) return errorResponse('disabled')
    let ticket: LiveTicketClaims | undefined
    if (browser) {
      const admitted = await admitLiveTicket(c.env, browser.ticket, 'buddies')
      if (!admitted.ok) return admitted.response
      ticket = admitted.claims
    }
    const admission = await admitCaller(c, BUDDIES_LIVE_OP, ticket)
    if (!admission.ok) return admission.response
    const { caller } = admission
    // A browser's token never opens a header socket: nothing would close it
    // when the token expires. Browsers use tickets.
    if (!ticket && caller.account?.platform === 'web')
      return errorResponse('forbidden')
    if (!isWebSocketUpgrade(c.req.raw))
      return errorResponse('upgrade_required')
    const now = Date.now()
    if (ticket) {
      const internal = {
        [BUDDIES_ENVELOPE_HEADERS.payload]: encodeLiveFields(ticket.id),
        [BUDDIES_LIVE_ACCOUNT_HEADER]: caller.account!.accountId,
        [BUDDIES_LIVE_EXPIRES_HEADER]: String(caller.expiresAt),
        [LIVE_TICKET_HEADER]: ticket.hash,
      }
      const request = forwardedLiveRequest(c.req.raw, internal)
      const fields = readHeaderFields(BUDDIES_LIVE_OP, request.headers, now)
      if (!fields.ok) return errorResponse(fields.error)
      return acceptLiveSubprotocol(
        await inbox(c.env, fields.value.inboxId).fetch(request)
      )
    }
    let inboxId: string
    if (caller.account) {
      const fields = readHeaderFields(BUDDIES_LIVE_OP, c.req.raw.headers, now)
      if (!fields.ok) return errorResponse(fields.error)
      inboxId = fields.value.inboxId
    } else {
      const call = readLiveCall(c.req.raw.headers, now)
      if (!call.ok) return errorResponse(call.error)
      if (isStale(call.value.ts, now)) return errorResponse('stale')
      if (await ownedByOldKey(c.env, call.value.inboxId)) return keyChanged()
      inboxId = call.value.inboxId
    }
    return await inbox(c.env, inboxId).fetch(
      liveRequest(c.req.raw, caller.account)
    )
  } catch (error) {
    console.error('buddies: request failed', { op: BUDDIES_LIVE_OP })
    captureFailure(error, BUDDIES_LIVE_OP)
    return buddiesInternalError()
  }
}

/** Bytes only: never sniffed, cached, or stored anywhere on the way. */
const BLOB_HEADERS = {
  'Content-Type': 'application/octet-stream',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const

/** Shared gates before any blob op: both switches, then the caller and its edge limit. */
const admitBlobOp = async (
  c: AppContext,
  op: typeof BUDDIES_BLOB_PUT_OP | typeof BUDDIES_BLOB_GET_OP
): Promise<Admission> => {
  if (!(await isBuddiesEnabled(c.env)))
    return { ok: false, response: errorResponse('disabled') }
  if (!(await photosAvailable(c.env)))
    return { ok: false, response: errorResponse('photos_disabled') }
  return admitCaller(c, op)
}

/**
 * A `blob/put`'s call from its headers: the bearer request's fields on behalf
 * of its account, or the legacy owner-signed envelope (fresh `ts` required).
 */
const blobPutCall = (
  headers: Headers,
  now: number,
  account: AccountAuth | null
): BuddiesResult<OwnerCall<BlobPutPayload>> => {
  if (account) {
    const fields = readHeaderFields(BUDDIES_BLOB_PUT_OP, headers, now)
    return fields.ok
      ? ok({ ...fields.value, accountId: account.accountId })
      : fields
  }
  const call = readBlobPutCall(headers, now)
  if (!call.ok) return call
  return isStale(call.value.ts, now) ? fail('stale') : call
}

/**
 * `POST blob/put`: an owner's upload of one sealed photo. The body is the raw
 * sealed bytes, so the request's fields ride in `x-buddies-payload` (plus
 * `x-buddies-signature`, op `blob/put`, for a legacy owner-signed upload).
 * `bytes` is checked before the body is read and the read stops past it; the
 * body's SHA-256 must be `blobId`, so a signature covers the bytes too. The
 * inbox DO authenticates the call (and takes a legacy one's nonce), applies
 * the caps, and writes the object.
 */
const handleBlobPut = async (c: AppContext): Promise<Response> => {
  try {
    const admission = await admitBlobOp(c, BUDDIES_BLOB_PUT_OP)
    if (!admission.ok) return admission.response
    const { account } = admission.caller
    const call = blobPutCall(c.req.raw.headers, Date.now(), account)
    if (!call.ok) return errorResponse(call.error)
    if (!account && (await ownedByOldKey(c.env, call.value.inboxId)))
      return keyChanged()
    if (call.value.bytes > BUDDIES_LIMITS.blobBytes)
      return errorResponse('too_large')
    const body = await readBlobBody(c.req.raw, call.value.bytes)
    if (!body.ok) return errorResponse(body.error)
    // Content addressing of the ciphertext the relay holds, never of plaintext.
    const blobId = bytesToBase64Url(await sha256Bytes(body.value))
    if (blobId !== call.value.blobId) return errorResponse('bad_request')
    const result = await inbox(c.env, call.value.inboxId).putBlob(
      call.value,
      body.value
    )
    if (!result.ok) return errorResponse(result.error, result.retryAfterSeconds)
    return c.json({ ok: true, expiresAt: result.value.expiresAt })
  } catch (error) {
    console.error('buddies: request failed', { op: BUDDIES_BLOB_PUT_OP })
    captureFailure(error, BUDDIES_BLOB_PUT_OP)
    return buddiesInternalError()
  }
}

/**
 * `POST blob/get`: an unsigned `{ "payload": … }` envelope whose payload names the
 * sender's inbox, the blob, and the read token (the capability), the same
 * with or without a bearer token. Answers the raw sealed bytes, or one
 * `not_found` for an unknown inbox or blob, an expired blob, and a wrong
 * token alike.
 */
const handleBlobGet = async (c: AppContext): Promise<Response> => {
  try {
    const admission = await admitBlobOp(c, BUDDIES_BLOB_GET_OP)
    if (!admission.ok) return admission.response
    const text = await readEnvelopeText(c.req.raw)
    const envelope = text == null ? null : parseEnvelope(text)
    const payload = envelope
      ? BUDDIES_PAYLOAD_PARSERS[BUDDIES_BLOB_GET_OP](
          envelope.payload,
          Date.now()
        )
      : null
    if (!payload) return errorResponse('bad_request')
    // Only the hash crosses into the DO; it's compared in constant time there.
    const tokenHash = bytesToBase64Url(await sha256Bytes(payload.token))
    const allowed = await inbox(c.env, payload.inboxId).authorizeBlobRead({
      inboxId: payload.inboxId,
      blobId: payload.blobId,
      tokenHash,
    })
    if (!allowed.ok) return errorResponse(allowed.error)
    const object = await c.env.BUDDY_BLOBS?.get(
      buddyBlobKey(payload.inboxId, payload.blobId)
    )
    if (!object) return errorResponse('not_found')
    return new Response(object.body, {
      headers: { ...BLOB_HEADERS, 'Content-Length': String(object.size) },
    })
  } catch (error) {
    console.error('buddies: request failed', { op: BUDDIES_BLOB_GET_OP })
    captureFailure(error, BUDDIES_BLOB_GET_OP)
    return buddiesInternalError()
  }
}

/**
 * `POST inbox/successor`: `{ inboxId }` as plain JSON → `{ ok, successor }`,
 * the inbox that replaced it after a key change, or null (witness-work ADR
 * 0039 §5). Any account's bearer token reads it: a buddy checks a
 * `pair.reconnect` with it. It tells anyone who knows the old inbox id that
 * it was replaced, and by which inbox. No legacy form (`unauthorized`
 * without a token). Counts as a read.
 */
const handleSuccessor = async (c: AppContext): Promise<Response> => {
  try {
    if (!(await isBuddiesEnabled(c.env))) return errorResponse('disabled')
    if (!hasAuthorization(c)) return errorResponse('unauthorized')
    const admission = await admitCaller(c, BUDDIES_SUCCESSOR_OP)
    if (!admission.ok) return admission.response
    if (!c.env.ACCOUNTS_DB) return errorResponse('disabled')
    const text = await readEnvelopeText(c.req.raw)
    const body = text == null ? null : parseJsonOrNull(text)
    if (!isPlainObject(body) || isEnvelopeBody(body))
      return errorResponse('bad_request')
    const fields = BUDDIES_FIELD_PARSERS[BUDDIES_SUCCESSOR_OP](body, Date.now())
    if (!fields) return errorResponse('bad_request')
    const successor = await findInboxSuccessor(
      accountsDb(c.env.ACCOUNTS_DB),
      fields.inboxId
    )
    return c.json({ ok: true, successor })
  } catch (error) {
    console.error('buddies: request failed', { op: BUDDIES_SUCCESSOR_OP })
    captureFailure(error, BUDDIES_SUCCESSOR_OP)
    return buddiesInternalError()
  }
}

/** Mounted at `/buddies/v1` by the Worker entry point. */
export const createBuddiesRoutes = (
  deps: BuddiesRouteDependencies = { push: defaultApnsDependencies }
) => {
  const routes = new Hono<AppEnv>()
  for (const op of BUDDIES_OPS) {
    routes.post(`/${op}`, buddiesOpDocs[op], (c) =>
      handleBuddiesOp(c, op, deps)
    )
  }
  routes.get(`/${BUDDIES_LIVE_OP}`, buddiesLiveDocs, handleLive)
  routes.post(`/${BUDDIES_BLOB_PUT_OP}`, buddiesBlobPutDocs, handleBlobPut)
  routes.post(`/${BUDDIES_BLOB_GET_OP}`, buddiesBlobGetDocs, handleBlobGet)
  routes.post(`/${BUDDIES_SUCCESSOR_OP}`, buddiesSuccessorDocs, handleSuccessor)
  return routes
}
