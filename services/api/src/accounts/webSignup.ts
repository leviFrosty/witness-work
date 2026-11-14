import { sql } from 'drizzle-orm'
import type { AppContext, Environment } from '../types'
import { captureFailure } from '../sentry'
import { bytesToBase64Url } from '../crypto'
import { isPlainObject } from '../buddies/contracts'
import { buddiesErrorResponse } from '../buddies/errorResponse'
import { buddiesCallerKey } from '../buddies/limits'
import { ACCOUNT_LIMITS, isTurnstileToken } from './contracts'
import { readPlainJson } from './auth'
import {
  guarded,
  quotaName,
  refuseAtEdge,
  refuseOverDailyQuota,
  verifiedBody,
} from './signed'
import {
  accountsDb,
  findAccountByPub,
  isRetiredKey,
  refuseRetiredKey,
  newAccountId,
  type AccountsDb,
} from './store'
import { activityInsert } from './activity'
import { accessTokenKeys, type AccessTokenKeys } from './tokens'
import { accounts } from './schema'
import {
  passkeyRelyingParties,
  resolveRelyingParty,
  type PasskeyRelyingParties,
} from './passkeyConfig'
import {
  issueChallengeToken,
  issueTicket,
  openChallengeToken,
  passkeyTokensReady,
} from './passkeyTokens'
import {
  batchUsing,
  claimNonce,
  envelopeNonce,
  findPasskey,
  findUsedToken,
  newUserHandle,
  passkeyInsert,
  usedTokenInsert,
  wrapStatements,
} from './passkeyStore'
import { creationOptions, passkeyFailed } from './passkeys'
import { prepareSession } from './sessionStore'
import { opened } from './session'
import { parseRegistrationResponse, verifyRegistration } from './webauthn'
import {
  turnstileConfigured,
  verifyTurnstile,
  type TurnstileAction,
} from './turnstile'
import { readKvSwitch } from './legacySwitch'
import { counterName, rateCounter, refuseOverRateCounter } from './rateCounter'
import type { CounterLimit } from './rateCounterDO'

/**
 * Accounts on the web (witness-work ADR 0038 §5, `docs/passkeys-protocol.md`,
 * "Web sign-up" and "Signing in with a recovery key on the web"). There's no
 * device integrity on the web, so sign-up has three controls instead:
 *
 * - **Turnstile** (managed, action `web-signup`), verified before anything
 *   else happens (src/accounts/turnstile.ts).
 * - **Caps** in `AccountRateCounter`s, one per network (`capsShardName`: an
 *   HMAC of the ASN, so a request's IP and ASN limits stay in one object and
 *   are taken atomically, and no single object counts every sign-up):
 *   `WEB_SIGNUP_PER_IP_DAY` (3) per caller IP a rolling day, IPv6 by /64, and
 *   `WEB_SIGNUP_PER_ASN_HOUR` (30) per network a rolling hour. Checked at
 *   `web/signup/options` (an outage lets it through), taken at `web/signup`
 *   before the D1 batch (an outage refuses it: 503 `unavailable`), and given
 *   back if the batch fails. Keys are HMACs of the IP or ASN under a key from
 *   `ACCOUNT_TICKET_SECRET` that changes every UTC day
 *   (src/accounts/rateCounter.ts), so a count can never be tied to an IP or
 *   to the next day's; each limit also counts the same caller under
 *   yesterday's key, so the windows still roll. Derived from the secret
 *   alone, so they hold across isolates and restarts.
 * - **Kill switch**: KV `accounts:web-signup` (`off` refuses both routes with
 *   503 `disabled`), absent → the `WEB_SIGNUP` var, failed read → on.
 *
 * `web/recovery` mints a `recovery` ticket for an existing account, behind
 * Turnstile (`web-recovery`) and `WEB_RECOVERY_PER_IP_DAY` (10) recoveries
 * per caller IP a rolling day, counted only once Siteverify passed, so junk
 * can't lock a shared IP out; the kill switch doesn't apply.
 *
 * Both envelopes work once (409 `replay`), as passkey ops do.
 *
 * Privacy: nothing here logs or reports IPs, ASNs, tokens, tickets, keys,
 * or account ids.
 */

const HOUR_MS = 60 * 60 * 1_000
const DAY_MS = 24 * HOUR_MS

export const WEB_SIGNUP_KEY = 'accounts:web-signup'

export const WEB_LIMITS = {
  signupsPerIpDay: 3,
  signupsPerAsnHour: 30,
  recoveriesPerIpDay: 10,
} as const

/** Whether web sign-up is on: KV, then the var, then on; a failed read counts as on. */
export const isWebSignupOn = (
  env: Pick<Environment, 'WEB_SIGNUP'> & { NOTES_KV: Pick<KVNamespace, 'get'> }
): Promise<boolean> =>
  readKvSwitch(env.NOTES_KV, WEB_SIGNUP_KEY, env.WEB_SIGNUP, {
    // Turnstile and the caps still apply.
    onReadFailure: true,
    name: 'web sign-up switch',
  })

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

interface WebSetup {
  db: AccountsDb
  keys: AccessTokenKeys
  config: PasskeyRelyingParties
}

/**
 * Everything web sign-up and recovery need (the accounts database, the token,
 * challenge, and ticket secrets, the RP config, and Turnstile), or null.
 */
const webSetup = async (env: Environment): Promise<WebSetup | null> => {
  const d1 = env.ACCOUNTS_DB
  const config = passkeyRelyingParties(env)
  if (!d1 || !config || !turnstileConfigured(env)) return null
  const keys = await accessTokenKeys(env)
  return keys && (await passkeyTokensReady(env))
    ? { db: accountsDb(d1), keys, config }
    : null
}

/** The routes' setup, or 503 `disabled`. */
const ready = async (c: AppContext): Promise<WebSetup | { refusal: Response }> =>
  (await webSetup(c.env)) ?? { refusal: buddiesErrorResponse('disabled') }

/** Whether `GET /app/v1/config` should say web sign-up is available. */
export const webSignupAvailable = async (env: Environment): Promise<boolean> =>
  (await webSetup(env)) != null && (await isWebSignupOn(env))

// --- Caps ------------------------------------------------------------------------

/** The caller's ASN as Cloudflare gives it, or null (locally, sometimes). */
const callerAsn = (c: AppContext): string | null => {
  const asn = (c.req.raw as { cf?: { asn?: unknown } }).cf?.asn
  return typeof asn === 'number' && asn > 0 ? String(asn) : null
}

/**
 * The counter object for a network's caps: an HMAC of the ASN (`none` when
 * unknown), never the ASN.
 */
export const capsShardName = async (
  env: Environment,
  asn: string | null
): Promise<string> => `web-caps:${await counterName(env, 'web-caps-shard', asn ?? 'none')}`

/** One limit on `value`, named under today's key and also counting yesterday's. */
const capLimit = async (
  env: Environment,
  kind: string,
  value: string,
  limit: number,
  windowMs: number,
  now: number
): Promise<CounterLimit> => {
  const day = Math.floor(now / DAY_MS)
  const name = async (d: number) =>
    `${kind}:${await counterName(env, kind, value, `web-caps/${d}`)}`
  const [today, yesterday] = await Promise.all([name(day), name(day - 1)])
  return { key: today, limit, windowMs, alsoCount: [yesterday] }
}

const callerIp = (c: AppContext) => buddiesCallerKey(c.req.header('CF-Connecting-IP'))

/** Sign-up's limits for this caller: per IP a day, and per ASN an hour when known. */
const signupLimits = async (c: AppContext, now: number): Promise<CounterLimit[]> => {
  const asn = callerAsn(c)
  const limits = [
    await capLimit(
      c.env,
      'signup-ip',
      callerIp(c),
      positiveInt(c.env.WEB_SIGNUP_PER_IP_DAY, WEB_LIMITS.signupsPerIpDay),
      DAY_MS,
      now
    ),
  ]
  if (asn)
    limits.push(
      await capLimit(
        c.env,
        'signup-asn',
        asn,
        positiveInt(c.env.WEB_SIGNUP_PER_ASN_HOUR, WEB_LIMITS.signupsPerAsnHour),
        HOUR_MS,
        now
      )
    )
  return limits
}

/** Recovery's limit for this caller: per IP a day. */
const recoveryLimits = async (c: AppContext, now: number): Promise<CounterLimit[]> => [
  await capLimit(
    c.env,
    'recovery-ip',
    callerIp(c),
    positiveInt(c.env.WEB_RECOVERY_PER_IP_DAY, WEB_LIMITS.recoveriesPerIpDay),
    DAY_MS,
    now
  ),
]

/** Checks (or takes) the caller's caps in its network's counter. */
const refuseOverCaps = async (
  c: AppContext,
  op: string,
  limits: CounterLimit[],
  use: { now: number; count?: boolean; onOutage?: 'allow' | 'refuse' }
): Promise<Response | null> =>
  refuseOverRateCounter(c, await capsShardName(c.env, callerAsn(c)), limits, op, {
    limitName: 'webCaps',
    ...use,
  })

/** The Turnstile check, as a refusal or null. */
const refuseTurnstile = async (
  c: AppContext,
  token: unknown,
  action: TurnstileAction
): Promise<Response | null> => {
  const outcome = await verifyTurnstile(c.env, {
    token,
    action,
    remoteip: c.req.header('CF-Connecting-IP') ?? null,
  })
  if (outcome.ok) return null
  if ('unavailable' in outcome) {
    console.warn('accounts: Turnstile unavailable', { action })
    return buddiesErrorResponse('unavailable', { retryAfterSeconds: 30 })
  }
  return buddiesErrorResponse('turnstile_failed', { extras: { reason: outcome.reason } })
}

// --- Sign-up ---------------------------------------------------------------------

/**
 * `POST /web/signup/options`, no auth: `{ turnstileToken, rpId? }`. In order:
 * the kill switch, the caps (checked only), then Siteverify. Mints the new
 * account's id and user handle into the challenge; stores nothing.
 */
const handleSignupOptions = guarded('web/signup/options', async (c) => {
  const setup = await ready(c)
  if ('refusal' in setup) return setup.refusal
  if (!(await isWebSignupOn(c.env))) return buddiesErrorResponse('disabled')
  const limited = await refuseAtEdge(c, 'inbox/register')
  if (limited) return limited
  const body = await readPlainJson(c)
  if (!isPlainObject(body) || !isTurnstileToken(body.turnstileToken))
    return buddiesErrorResponse('bad_request')
  const party = resolveRelyingParty(setup.config, body.rpId, c.req.header('Origin'))
  if (!party) return buddiesErrorResponse('bad_request')

  const now = Date.now()
  const capped = await refuseOverCaps(c, 'web/signup/options', await signupLimits(c, now), { now })
  if (capped) return capped

  const refused = await refuseTurnstile(c, body.turnstileToken, 'web-signup')
  if (refused) return refused

  const accountId = newAccountId()
  const userHandle = newUserHandle()
  const { token, claims } = await issueChallengeToken(c.env, {
    purpose: 'signup',
    rpId: party.rpId,
    challenge: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32))),
    accountId,
    userHandle,
  })
  return c.json({
    ok: true,
    accountId,
    challengeToken: token,
    options: await creationOptions({ ...claims, userHandle }, []),
    userHandle,
  })
})

/**
 * `POST /web/signup`, signed (op `web/signup`): the passkey the options
 * created, its optional wrap, and the web session, in one batch with the
 * account (`created_via: web`), `account.created`, `passkey.added`, and
 * `session.opened` (`method: signup`). 201 with the session's answer and
 * `credentialId`.
 */
const handleSignup = guarded('web/signup', async (c) => {
  const setup = await ready(c)
  if ('refusal' in setup) return setup.refusal
  if (!(await isWebSignupOn(c.env))) return buddiesErrorResponse('disabled')
  const limited = await refuseAtEdge(c, 'inbox/register')
  if (limited) return limited
  const verified = await verifiedBody(c, 'web/signup')
  if ('refusal' in verified) return verified.refusal
  const { accountPub } = verified.payload
  const { fields } = verified
  const { db, config } = setup
  const nonce = await envelopeNonce(verified.payload)
  if (await findUsedToken(db, nonce.id)) return buddiesErrorResponse('replay')

  const overQuota = await refuseOverDailyQuota(
    c.env,
    await quotaName('session-open', accountPub),
    ACCOUNT_LIMITS.sessionOpensPerDay,
    'web/signup',
    'sessionOpensPerDay'
  )
  if (overQuota) return overQuota

  const response = parseRegistrationResponse(fields.response)
  if (!response) return buddiesErrorResponse('bad_request')
  const claims = await openChallengeToken(c.env, fields.challengeToken)
  if (!claims || claims.purpose !== 'signup' || !claims.accountId || !claims.userHandle)
    return passkeyFailed('challenge')
  if (await findUsedToken(db, claims.id)) return passkeyFailed('challenge')
  // A retired key never makes an account (ADR 0039).
  const retired = await refuseRetiredKey(db, accountPub)
  if (retired) return retired
  if (await findAccountByPub(db, accountPub)) return buddiesErrorResponse('conflict')

  const registration = await verifyRegistration(
    response,
    { challenge: claims.challenge, rpId: claims.rpId },
    config
  )
  if ('failed' in registration) return passkeyFailed(registration.failed)
  if (await findPasskey(db, registration.credentialId))
    return buddiesErrorResponse('conflict')

  // Taken here, atomically; an outage refuses (fails closed), since the
  // caps are what stands in for device integrity on the web.
  const now = Date.now()
  const limits = await signupLimits(c, now)
  const overCaps = await refuseOverCaps(c, 'web/signup', limits, {
    now,
    count: true,
    onOutage: 'refuse',
  })
  if (overCaps) return overCaps
  const refund = async () => {
    try {
      const shard = await capsShardName(c.env, callerAsn(c))
      await rateCounter(c.env, shard).refund(now, limits)
    } catch (error) {
      captureFailure(error, 'web/signup caps refund')
    }
  }

  const accountId = claims.accountId
  const { statements, issued } = await prepareSession(db, setup.keys.current, {
    accountId,
    accountPub,
    keyEpoch: 0,
    platform: 'web',
    device: fields.device,
    method: 'signup',
    appVersion: fields.appVersion,
    capabilities: fields.capabilities,
    stepUpCredentialId: registration.credentialId,
  }, now)
  let outcome: Awaited<ReturnType<typeof batchUsing>>
  try {
    outcome = await batchUsing(db, [nonce.id, claims.id], () =>
      db.batch([
        usedTokenInsert(db, nonce),
        usedTokenInsert(db, { id: claims.id, expiresAt: claims.expiresAt }),
        // Never for a retired key, checked in the insert itself: without
        // the account the rest of the batch fails its foreign keys. Columns
        // in the table's order (`registerAccount` lists them); the literals
        // are the defaults, but `created_via` is `web` and the handle is set.
        db.insert(accounts).select(
          sql`SELECT ${accountId}, ${accountPub}, 'active', ${now},
              ${claims.userHandle}, 0, 'web', NULL
            WHERE NOT ${isRetiredKey(accountPub)}`
        ),
        activityInsert(db, { accountId, kind: 'account.created' }, { now }),
        passkeyInsert(
          db,
          {
            ...registration,
            accountId,
            rpId: claims.rpId,
            createdPlatform: 'web',
            label: fields.label,
          },
          now
        ),
        ...(fields.wrap && fields.wrapId
          ? wrapStatements(
              db,
              {
                wrapId: fields.wrapId,
                credentialId: registration.credentialId,
                accountId,
                keyEpoch: 0,
                wrap: fields.wrap,
              },
              now
            )
          : []),
        ...statements,
        activityInsert(
          db,
          {
            accountId,
            kind: 'passkey.added',
            sessionId: issued.session.id,
            credentialId: registration.credentialId,
          },
          { now }
        ),
      ])
    )
  } catch (error) {
    await refund()
    const retiredSince = await refuseRetiredKey(db, accountPub)
    if (retiredSince) return retiredSince
    // A racing sign-up with the same key, or the same credential.
    if (
      (await findAccountByPub(db, accountPub)) ||
      (await findPasskey(db, registration.credentialId))
    )
      return buddiesErrorResponse('conflict')
    throw error
  }
  if ('used' in outcome) {
    await refund()
    return outcome.used === nonce.id
      ? buddiesErrorResponse('replay')
      : passkeyFailed('challenge')
  }
  return opened(c, setup.keys, { id: accountId, status: 'active' }, issued, {
    credentialId: registration.credentialId,
  })
})

// --- Recovery --------------------------------------------------------------------

/**
 * `POST /web/recovery`, signed (op `web/recovery`): `{ accountPub, ts, nonce,
 * turnstileToken }` → a `recovery` ticket for the key's existing account. In
 * order: the envelope (used once: `replay`), the cap checked
 * (`WEB_RECOVERY_PER_IP_DAY`, 10 per caller IP a rolling day), Turnstile
 * (`web-recovery`), the cap taken, then the account (404 `unknown_account`:
 * the web never creates an account from a recovery key; 403 `key_retired`
 * for a key a key change replaced). Only a request
 * that passed Siteverify counts, so junk can't lock a shared IP out; a
 * counter outage lets it through, since the envelope already proves the key.
 */
const handleRecovery = guarded('web/recovery', async (c) => {
  const setup = await ready(c)
  if ('refusal' in setup) return setup.refusal
  const limited = await refuseAtEdge(c, 'inbox/register')
  if (limited) return limited
  const verified = await verifiedBody(c, 'web/recovery')
  if ('refusal' in verified) return verified.refusal
  const nonce = await envelopeNonce(verified.payload)
  if (await findUsedToken(setup.db, nonce.id)) return buddiesErrorResponse('replay')

  const now = Date.now()
  const limits = await recoveryLimits(c, now)
  const capped = await refuseOverCaps(c, 'web/recovery', limits, { now })
  if (capped) return capped
  const refused = await refuseTurnstile(c, verified.fields.turnstileToken, 'web-recovery')
  if (refused) return refused
  const overCaps = await refuseOverCaps(c, 'web/recovery', limits, { now, count: true })
  if (overCaps) return overCaps

  if (!(await claimNonce(setup.db, nonce))) return buddiesErrorResponse('replay')
  const account = await findAccountByPub(setup.db, verified.payload.accountPub)
  if (!account) {
    // A recovery key a key change replaced (ADR 0039).
    return (
      (await refuseRetiredKey(setup.db, verified.payload.accountPub)) ??
      buddiesErrorResponse('unknown_account')
    )
  }
  const { ticket, claims } = await issueTicket(c.env, {
    kind: 'recovery',
    accountId: account.id,
  })
  return c.json({
    ok: true,
    accountId: account.id,
    ticket,
    ticketExpiresAt: claims.expiresAt,
  })
})

export const webHandlers = {
  signupOptions: handleSignupOptions,
  signup: handleSignup,
  recovery: handleRecovery,
}
