import type { AppContext, Environment } from '../types'
import { captureFailure } from '../sentry'
import { bytesToBase64Url, sha256Bytes } from '../crypto'
import {
  BUDDIES_LIMITS,
  decodeSignature,
  isPlainObject,
  type BuddiesResult,
  type BuddiesRouteOp,
} from '../buddies/contracts'
import {
  type Envelope,
  envelopeFromHeaders,
  parseEnvelope,
  readEnvelopeText,
  verifyEd25519,
} from '../buddies/envelope'
import {
  buddiesErrorResponse,
  buddiesInternalError,
} from '../buddies/errorResponse'
import {
  allowBuddiesCaller,
  buddiesCallerKey,
  EDGE_RETRY_AFTER_SECONDS,
  logLimitHit,
} from '../buddies/limits'
import {
  ACCOUNT_ENVELOPE_HEADERS,
  ACCOUNT_FIELD_PARSERS,
  LEGACY_ACCOUNT_ENVELOPE_HEADERS,
  type AccountFields,
  type AccountKeyPayload,
  type AccountsOp,
  accountSignedMessage,
  handoffBlobTooLarge,
  parseAccountKeyPayload,
  passkeyAddTooLarge,
  rekeyTooLarge,
  sessionDeviceTooLarge,
  webSignupTooLarge,
} from './contracts'
import { accountsDb, findAccountByPub, type AccountRecord } from './store'
import { envelopeNonce, findUsedToken, type UsedId } from './passkeyStore'
import {
  bearerOrLegacy,
  type AccountAuth,
  type RequireAccountOptions,
} from './auth'

/** A self-signed account op whose envelope, signature, and `ts` check out. */
export interface VerifiedCall<K extends AccountsOp> {
  payload: AccountKeyPayload
  fields: AccountFields<K>
}

export type Verified<K extends AccountsOp> =
  | VerifiedCall<K>
  | { refusal: Response }

/** Each op's own `too_large` check, run on the payload before parsing it. */
const TOO_LARGE: Partial<Record<AccountsOp, (payload: unknown) => boolean>> = {
  'handoff/send': handoffBlobTooLarge,
  'session/open': sessionDeviceTooLarge,
  'passkey/add': passkeyAddTooLarge,
  'web/signup': webSignupTooLarge,
  'account/rekey': rekeyTooLarge,
}

/**
 * Checks a parsed envelope for `op`: the key payload and the op's own fields
 * (`bad_request`, or `too_large` for a field over its cap: `TOO_LARGE`), the
 * signature by the named key (`bad_signature`), and the timestamp (`stale`).
 */
export const verifyEnvelope = async <K extends AccountsOp>(
  op: K,
  envelope: Envelope | null
): Promise<Verified<K>> => {
  if (envelope && TOO_LARGE[op]?.(envelope.payload))
    return { refusal: buddiesErrorResponse('too_large') }
  const payload = envelope ? parseAccountKeyPayload(envelope.payload) : null
  const fields = envelope
    ? (ACCOUNT_FIELD_PARSERS[op](envelope.payload) as AccountFields<K> | null)
    : null
  if (!envelope || !payload || !fields)
    return { refusal: buddiesErrorResponse('bad_request') }
  const signature = decodeSignature(envelope.signature)
  if (!signature) return { refusal: buddiesErrorResponse('bad_signature') }
  if (Math.abs(Date.now() - payload.ts) > BUDDIES_LIMITS.timestampSkewMs)
    return { refusal: buddiesErrorResponse('stale') }
  const valid = await verifyEd25519(
    payload.accountPub,
    accountSignedMessage(op, envelope.payloadBytes),
    signature
  )
  return valid
    ? { payload, fields }
    : { refusal: buddiesErrorResponse('bad_signature') }
}

/** A self-signed op whose envelope is the JSON body. */
export const verifiedBody = async <K extends AccountsOp>(
  c: AppContext,
  op: K
): Promise<Verified<K>> => {
  const text = await readEnvelopeText(c.req.raw)
  return verifyEnvelope(op, text == null ? null : parseEnvelope(text))
}

/** A self-signed op whose envelope rides in `x-ww-payload` and `x-ww-signature`. */
export const verifiedHeaders = <K extends AccountsOp>(
  c: AppContext,
  op: K
): Promise<Verified<K>> =>
  verifyEnvelope(
    op,
    envelopeFromHeaders(
      c.req.raw.headers,
      ACCOUNT_ENVELOPE_HEADERS,
      LEGACY_ACCOUNT_ENVELOPE_HEADERS
    )
  )

/** The registered account for a verified key, or `unknown_account`. */
export const accountForKey = async (
  env: Environment,
  accountPub: string
): Promise<{ account: AccountRecord } | { refusal: Response }> => {
  const db = env.ACCOUNTS_DB
  if (!db) return { refusal: buddiesErrorResponse('disabled') }
  const account = await findAccountByPub(accountsDb(db), accountPub)
  return account
    ? { account }
    : { refusal: buddiesErrorResponse('unknown_account') }
}

/**
 * A signed op's fields from the JSON body of a bearer request, whose key
 * must be the token's own account (`forbidden` otherwise), and the
 * envelope's nonce, which must not have been used (409 `replay`). The caller
 * records `nonce` (`usedTokenInsert`) in the batch of what the envelope
 * signs, so each envelope works once.
 */
export const signedForToken = async <K extends AccountsOp>(
  c: AppContext,
  op: K,
  account: AccountAuth
): Promise<
  { fields: AccountFields<K>; nonce: UsedId } | { refusal: Response }
> => {
  const verified = await verifiedBody(c, op)
  if ('refusal' in verified) return verified
  const found = await accountForKey(c.env, verified.payload.accountPub)
  if ('refusal' in found) return found
  if (found.account.id !== account.accountId)
    return { refusal: buddiesErrorResponse('forbidden') }
  const nonce = await envelopeNonce(verified.payload)
  if (await findUsedToken(accountsDb(c.env.ACCOUNTS_DB!), nonce.id))
    return { refusal: buddiesErrorResponse('replay') }
  return { fields: verified.fields, nonce }
}

/** A bearer request's fields for `op`, or its refusal. */
export type BearerFields<K extends AccountsOp> =
  | { fields: AccountFields<K> }
  | { refusal: Response }

/** How a converted op reads its fields, each way it can authenticate. */
export interface AccountCallRead<K extends AccountsOp> {
  bearer: (account: AccountAuth) => Promise<BearerFields<K>>
  legacy: () => Promise<Verified<K>>
}

/**
 * Runs an account op converted to bearer tokens (`bearerOrLegacy`). A bearer
 * request is the token's account, with the fields `read.bearer` takes from
 * the request (or its refusal). A legacy request, while the legacy switch is
 * on, is the envelope `read.legacy` verifies, whose key must belong to a
 * registered account (`unknown_account`), exactly as before sessions.
 * `options` check the bearer token's session and account (`requireAccount`).
 */
export const accountCall = <K extends AccountsOp>(
  c: AppContext,
  read: AccountCallRead<K>,
  run: (accountId: string, fields: AccountFields<K>) => Promise<Response>,
  options?: RequireAccountOptions
): Promise<Response> =>
  bearerOrLegacy(
    c,
    {
      bearer: async (account) => {
        const bearer = await read.bearer(account)
        return 'refusal' in bearer
          ? bearer.refusal
          : run(account.accountId, bearer.fields)
      },
      legacy: async () => {
        const verified = await read.legacy()
        if ('refusal' in verified) return verified.refusal
        const found = await accountForKey(c.env, verified.payload.accountPub)
        if ('refusal' in found) return found.refusal
        return run(found.account.id, verified.fields)
      },
    },
    options
  )

/** A bearer request's fields for `op` from its JSON body, or `bad_request`. */
export const plainFields = <K extends AccountsOp>(
  op: K,
  body: unknown
): BearerFields<K> => {
  const fields = isPlainObject(body)
    ? (ACCOUNT_FIELD_PARSERS[op](body) as AccountFields<K> | null)
    : null
  return fields ? { fields } : { refusal: buddiesErrorResponse('bad_request') }
}

/**
 * Counts the request against the Buddies edge tier `as` (named by a Buddies
 * op of that tier). Null admits.
 */
export const refuseAtEdge = async (
  c: AppContext,
  as: BuddiesRouteOp
): Promise<Response | null> => {
  const callerKey = buddiesCallerKey(c.req.header('CF-Connecting-IP'))
  return (await allowBuddiesCaller(c.env, as, callerKey))
    ? null
    : buddiesErrorResponse('rate_limited', {
        retryAfterSeconds: EDGE_RETRY_AFTER_SECONDS,
      })
}

/** A hashed Durable Object name for a rolling-day quota, under `label`. */
export const quotaName = async (label: string, key: string): Promise<string> =>
  bytesToBase64Url(
    await sha256Bytes(new TextEncoder().encode(`ww-account/v1/${label}\n${key}`))
  )

/**
 * Counts one call against a rolling-day quota (a `BuddyRegistrationQuota`
 * object under `name`). Null admits; a quota outage admits too. `logHit`
 * logs a refusal.
 */
export const refuseOverDailyQuota = async (
  env: Environment,
  name: string,
  limit: number | undefined,
  op: string,
  limitName: string,
  logHit: (op: string, limit: string) => void = logLimitHit
): Promise<Response | null> => {
  try {
    const quota = env.BUDDY_REGISTRATION_QUOTA
    const admission = await quota
      .get(quota.idFromName(name))
      .admit(Date.now(), limit)
    if (admission.ok) return null
    logHit(op, limitName)
    return buddiesErrorResponse('rate_limited', {
      retryAfterSeconds: admission.retryAfterSeconds,
    })
  } catch (error) {
    console.warn('accounts: quota unavailable; allowing', { op })
    captureFailure(error, op)
    return null
  }
}

/** A Durable Object's answer as JSON, `{ ok: true, ...value }` or the error. */
export const replyWith = <T extends object>(
  c: AppContext,
  result: BuddiesResult<T>
): Response =>
  result.ok
    ? c.json({ ok: true, ...result.value })
    : buddiesErrorResponse(result.error, {
        retryAfterSeconds: result.retryAfterSeconds,
      })

/**
 * Runs an accounts handler, turning a throw into a bare 500.
 *
 * Privacy: the log names the op only, never the body, keys, or ids, and a
 * database error reaches Sentry as the op alone (`captureFailure`), since its
 * message quotes the query's parameters.
 */
export const guarded =
  (op: string, handler: (c: AppContext) => Promise<Response>) =>
  async (c: AppContext): Promise<Response> => {
    try {
      return await handler(c)
    } catch (error) {
      console.error('accounts: request failed', { op })
      captureFailure(error, op)
      return buddiesInternalError()
    }
  }
