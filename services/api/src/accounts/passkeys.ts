import { and, eq, sql } from 'drizzle-orm'
import type { AppContext } from '../types'
import { captureFailure } from '../sentry'
import { bytesToBase64Url } from '../crypto'
import { isPlainObject } from '../buddies/contracts'
import { buddiesErrorResponse } from '../buddies/errorResponse'
import { buddiesCallerKey } from '../buddies/limits'
import { passkeyResponseTooLarge } from './contracts'
import { authenticateAccount, readPlainJson, type AccountAuth } from './auth'
import { guarded, refuseAtEdge, signedForToken } from './signed'
import { accountsDb, changes, type AccountsDb } from './store'
import { activityInsert } from './activity'
import { counterName, rateCounter, refuseOverRateCounter } from './rateCounter'
import { accessTokenKeys } from './tokens'
import {
  isAndroidOrigin,
  passkeyRelyingParties,
  resolveRelyingParty,
  RP_NAME,
  type PasskeyRelyingParties,
} from './passkeyConfig'
import {
  credentialHash,
  issueChallengeToken,
  issueTicket,
  openChallengeToken,
  passkeyTokensReady,
  type ChallengeClaims,
} from './passkeyTokens'
import {
  accountPasskeys,
  batchUsing,
  batchUsingToken,
  credentialWraps,
  ensureUserHandle,
  findPasskey,
  findPasskeyAccount,
  findUsedToken,
  findWrap,
  hasPasskey,
  passkeyInsert,
  passkeyUserName,
  unlockingCredentials,
  usedTokenInsert,
  wrapStatements,
} from './passkeyStore'
import { passkeys } from './schema'
import { stepUpUpdate } from './sessionStore'
import { refuseWithoutStepUp } from './stepUp'
import {
  parseAuthenticationResponse,
  parseCredentialId,
  parseRegistrationResponse,
  SUPPORTED_ALGORITHMS,
  verifyAssertion,
  verifyRegistration,
  type PasskeyFailureReason,
} from './webauthn'

/**
 * Passkeys (witness-work ADR 0038, `docs/passkeys-protocol.md`): credentials
 * of an existing server account that sign in and, with PRF, deliver the
 * account key through wraps the server can't open.
 *
 * - `POST /passkeys/challenge`: a challenge to sign in (no auth) or step up
 *   (Bearer).
 * - `POST /passkeys/assert`: verifies it; signing in answers the account,
 *   the credential's wraps, and a `passkey` ticket for a browser's session;
 *   a step-up records `stepUpAt` on the session.
 * - `POST /passkeys/register/options`, `POST /passkeys` (add, step-up),
 *   `POST /passkeys/wrap`, `GET /passkeys`, `POST /passkeys/remove` (step-up).
 *
 * Every route answers `disabled` without the accounts database, a token
 * secret, the RP config, or the challenge and ticket secrets. Each counts
 * against the read edge tier; failed assertions also against a budget of 30
 * per caller IP an hour.
 *
 * Privacy: nothing here logs or reports responses, challenge tokens,
 * tickets, credential ids, user handles, wraps, or anything PRF-adjacent.
 */

const HOUR_MS = 60 * 60 * 1_000
const CEREMONY_TIMEOUT_MS = 300_000

/** Failed assertions per caller IP an hour (`rate_limited`). */
export const ASSERT_FAILURE_LIMIT = { limit: 30, windowMs: HOUR_MS } as const

type Ready =
  | { db: AccountsDb; config: PasskeyRelyingParties }
  | { refusal: Response }

const ready = async (c: AppContext): Promise<Ready> => {
  const d1 = c.env.ACCOUNTS_DB
  const config = passkeyRelyingParties(c.env)
  const usable =
    d1 != null &&
    config != null &&
    (await accessTokenKeys(c.env)) != null &&
    (await passkeyTokensReady(c.env))
  return usable
    ? { db: accountsDb(d1), config: config! }
    : { refusal: buddiesErrorResponse('disabled') }
}

export const passkeyFailed = (reason: PasskeyFailureReason): Response =>
  buddiesErrorResponse('passkey_failed', { extras: { reason } })

const randomChallenge = (): string =>
  bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))

// --- The failure budget ---------------------------------------------------------

const failureName = (c: AppContext) =>
  counterName(
    c.env,
    'passkey-assert-failures',
    buddiesCallerKey(c.req.header('CF-Connecting-IP'))
  )

const FAILURE_KEY = [{ key: 'failures', ...ASSERT_FAILURE_LIMIT }]

/** 429 once the caller has failed 30 assertions this hour; an outage admits. */
const refuseOverFailureBudget = async (
  c: AppContext
): Promise<Response | null> =>
  refuseOverRateCounter(c, await failureName(c), FAILURE_KEY, 'passkeys/assert', {
    limitName: 'failuresPerHour',
  })

const countFailure = async (c: AppContext): Promise<void> => {
  try {
    // Counted even past the limit, by a key no limit stops.
    await rateCounter(c.env, await failureName(c)).take(Date.now(), [
      { key: 'failures', limit: Number.MAX_SAFE_INTEGER, windowMs: HOUR_MS },
    ])
  } catch (error) {
    captureFailure(error, 'passkeys/assert budget')
  }
}

// --- Challenges ---------------------------------------------------------------

const requestOptions = (
  claims: ChallengeClaims,
  allowCredentials: { id: string; type: 'public-key'; transports?: string[] }[]
) => ({
  challenge: claims.challenge,
  timeout: CEREMONY_TIMEOUT_MS,
  rpId: claims.rpId,
  allowCredentials,
  userVerification: 'required' as const,
})

const transportsOf = (stored: string | null): string[] | undefined => {
  if (!stored) return undefined
  try {
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? (parsed as string[]) : undefined
  } catch {
    return undefined
  }
}

/** The account's passkeys for `rpId`, as `allowCredentials` / `excludeCredentials`. */
const credentialDescriptors = async (
  db: AccountsDb,
  accountId: string,
  rpId: string
) =>
  (await accountPasskeys(db, accountId))
    .filter((passkey) => passkey.rpId === rpId)
    .map((passkey) => {
      const transports = transportsOf(passkey.transports)
      return {
        id: passkey.credentialId,
        type: 'public-key' as const,
        ...(transports ? { transports } : {}),
      }
    })

/**
 * `POST /passkeys/challenge`: `{ purpose: "sign-in", rpId? }` with no auth,
 * or `{ purpose: "step-up", rpId? }` with a Bearer token.
 */
const handleChallenge = guarded('passkeys/challenge', async (c) => {
  const setup = await ready(c)
  if ('refusal' in setup) return setup.refusal
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  const body = await readPlainJson(c)
  if (!isPlainObject(body)) return buddiesErrorResponse('bad_request')
  const party = resolveRelyingParty(setup.config, body.rpId, c.req.header('Origin'))
  if (!party) return buddiesErrorResponse('bad_request')

  if (body.purpose === 'sign-in') {
    const { token, claims } = await issueChallengeToken(c.env, {
      purpose: 'sign-in',
      rpId: party.rpId,
      challenge: randomChallenge(),
    })
    return c.json({
      ok: true,
      challengeToken: token,
      options: requestOptions(claims, []),
    })
  }
  if (body.purpose !== 'step-up') return buddiesErrorResponse('bad_request')

  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return auth.response
  const { accountId, sessionId } = auth.account
  const { token, claims } = await issueChallengeToken(c.env, {
    purpose: 'step-up',
    rpId: party.rpId,
    challenge: randomChallenge(),
    sessionId,
    accountId,
  })
  return c.json({
    ok: true,
    challengeToken: token,
    options: requestOptions(
      claims,
      await credentialDescriptors(setup.db, accountId, party.rpId)
    ),
  })
})

// --- Assertions ------------------------------------------------------------------

/**
 * `POST /passkeys/assert`: `{ challengeToken, response }`. A `sign-in`
 * challenge needs no auth and answers the account, the credential's wraps for
 * the current key epoch, and (except for an Android origin) a `passkey`
 * ticket; a `step-up` challenge needs the Bearer token of the session it was
 * issued to and answers `stepUpAt`.
 */
const handleAssert = guarded('passkeys/assert', async (c) => {
  const setup = await ready(c)
  if ('refusal' in setup) return setup.refusal
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  const overBudget = await refuseOverFailureBudget(c)
  if (overBudget) return overBudget

  const body = await readPlainJson(c)
  if (!isPlainObject(body)) return buddiesErrorResponse('bad_request')
  if (passkeyResponseTooLarge(body.response)) return buddiesErrorResponse('too_large')
  const response = parseAuthenticationResponse(body.response)
  if (!response || typeof body.challengeToken !== 'string')
    return buddiesErrorResponse('bad_request')

  const fail = async (reason: PasskeyFailureReason) => {
    await countFailure(c)
    return passkeyFailed(reason)
  }

  const claims = await openChallengeToken(c.env, body.challengeToken)
  if (!claims || (claims.purpose !== 'sign-in' && claims.purpose !== 'step-up'))
    return fail('challenge')

  let stepUp: AccountAuth | null = null
  if (claims.purpose === 'step-up') {
    const auth = await authenticateAccount(c, { requireLiveSession: true })
    if (!auth.ok) return auth.response
    if (
      auth.account.sessionId !== claims.sessionId ||
      auth.account.accountId !== claims.accountId
    )
      return fail('challenge')
    stepUp = auth.account
  }

  const { db, config } = setup
  if (await findUsedToken(db, claims.id)) return fail('challenge')
  const credential = await findPasskey(db, response.id)
  if (!credential || (stepUp && credential.accountId !== stepUp.accountId))
    return fail('unknown_credential')
  const account = await findPasskeyAccount(db, credential.accountId)
  if (!account) return fail('unknown_credential')
  const userHandle = response.response.userHandle
  // Signing in needs the handle (discoverable); a step-up's may be absent.
  if (
    (stepUp == null || userHandle !== undefined) &&
    (account.userHandle == null || userHandle !== account.userHandle)
  )
    return fail('user_handle')

  const verified = await verifyAssertion(
    response,
    { challenge: claims.challenge, rpId: claims.rpId },
    credential,
    config
  )
  if ('failed' in verified) return fail(verified.failed)

  const now = Date.now()
  const used = await batchUsingToken(db, claims.id, () =>
    db.batch([
      usedTokenInsert(db, { id: claims.id, expiresAt: claims.expiresAt }),
      db
        .update(passkeys)
        .set({
          // Never lowered: a synced passkey's 0 passes without resetting it.
          counter: sql`MAX(${passkeys.counter}, ${verified.counter})`,
          deviceType: verified.deviceType,
          backedUp: verified.backedUp,
          lastUsedAt: new Date(now),
        })
        .where(eq(passkeys.credentialId, credential.credentialId)),
      ...(stepUp
        ? [
            stepUpUpdate(
              db,
              {
                accountId: stepUp.accountId,
                sessionId: stepUp.sessionId,
                credentialId: credential.credentialId,
              },
              now
            ),
          ]
        : []),
    ])
  )
  if ('used' in used) return fail('challenge')

  if (stepUp)
    return c.json({
      ok: true,
      credentialId: credential.credentialId,
      stepUpAt: now,
    })

  const wraps = await credentialWraps(db, credential.credentialId, account.keyEpoch)
  const ticket = isAndroidOrigin(verified.origin)
    ? null
    : await issueTicket(c.env, {
        kind: 'passkey',
        accountId: account.id,
        credentialHash: await credentialHash(credential.credentialId),
      })
  return c.json({
    ok: true,
    accountId: account.id,
    accountPub: account.accountPub,
    status: account.status,
    keyEpoch: account.keyEpoch,
    credentialId: credential.credentialId,
    userHandle: account.userHandle,
    wraps,
    ...(ticket
      ? { ticket: ticket.ticket, ticketExpiresAt: ticket.claims.expiresAt }
      : {}),
  })
})

// --- Adding a passkey ---------------------------------------------------------

/** `PublicKeyCredentialCreationOptionsJSON` for the account's handle. */
export const creationOptions = async (
  claims: ChallengeClaims & { userHandle: string },
  excludeCredentials: { id: string; type: 'public-key'; transports?: string[] }[]
) => {
  const name = await passkeyUserName(claims.userHandle)
  return {
    rp: { id: claims.rpId, name: RP_NAME },
    user: { id: claims.userHandle, name, displayName: name },
    challenge: claims.challenge,
    pubKeyCredParams: SUPPORTED_ALGORITHMS.map((alg) => ({
      type: 'public-key' as const,
      alg,
    })),
    timeout: CEREMONY_TIMEOUT_MS,
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'required' as const,
      requireResidentKey: true,
      userVerification: 'required' as const,
    },
    attestation: 'none' as const,
  }
}

/** `POST /passkeys/register/options`: Bearer, `{ rpId? }`. Mints the user handle the first time. */
const handleRegisterOptions = guarded('passkeys/register/options', async (c) => {
  const setup = await ready(c)
  if ('refusal' in setup) return setup.refusal
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return auth.response
  const body = await readPlainJson(c)
  if (body != null && !isPlainObject(body)) return buddiesErrorResponse('bad_request')
  const party = resolveRelyingParty(
    setup.config,
    isPlainObject(body) ? body.rpId : undefined,
    c.req.header('Origin')
  )
  if (!party) return buddiesErrorResponse('bad_request')

  const { accountId, sessionId } = auth.account
  const userHandle = await ensureUserHandle(setup.db, accountId)
  if (!userHandle) return buddiesErrorResponse('unauthorized')
  const { token, claims } = await issueChallengeToken(c.env, {
    purpose: 'register',
    rpId: party.rpId,
    challenge: randomChallenge(),
    sessionId,
    accountId,
    userHandle,
  })
  return c.json({
    ok: true,
    challengeToken: token,
    options: await creationOptions(
      { ...claims, userHandle },
      await credentialDescriptors(setup.db, accountId, party.rpId)
    ),
    userHandle,
  })
})

/** Answers a credential already stored: `ok` for this account (a lost response), else `conflict`. */
const existingCredential = async (
  c: AppContext,
  db: AccountsDb,
  credentialId: string,
  accountId: string
): Promise<Response | null> => {
  const existing = await findPasskey(db, credentialId)
  if (!existing) return null
  return existing.accountId === accountId
    ? c.json({ ok: true, credentialId })
    : buddiesErrorResponse('conflict')
}

/**
 * `POST /passkeys`: Bearer and signed (op `passkey/add`), live session,
 * step-up. Stores the registration (and an optional wrap) and logs
 * `passkey.added`.
 */
const handleAdd = guarded('passkeys/add', async (c) => {
  const setup = await ready(c)
  if ('refusal' in setup) return setup.refusal
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return auth.response
  const signed = await signedForToken(c, 'passkey/add', auth.account)
  if ('refusal' in signed) return signed.refusal
  const { db, config } = setup
  const stepUpRefusal = await refuseWithoutStepUp(db, auth.account)
  if (stepUpRefusal) return stepUpRefusal

  const { fields, nonce } = signed
  const response = parseRegistrationResponse(fields.response)
  if (!response) return buddiesErrorResponse('bad_request')
  const { accountId, sessionId, platform } = auth.account
  const repeat = await existingCredential(c, db, response.id, accountId)
  if (repeat) return repeat

  const claims = await openChallengeToken(c.env, fields.challengeToken)
  if (
    !claims ||
    claims.purpose !== 'register' ||
    claims.sessionId !== sessionId ||
    claims.accountId !== accountId
  )
    return passkeyFailed('challenge')
  if (await findUsedToken(db, claims.id)) return passkeyFailed('challenge')
  const account = await findPasskeyAccount(db, accountId)
  if (!account) return buddiesErrorResponse('unauthorized')
  if (account.userHandle == null || claims.userHandle !== account.userHandle)
    return passkeyFailed('registration')

  const verified = await verifyRegistration(
    response,
    { challenge: claims.challenge, rpId: claims.rpId },
    config
  )
  if ('failed' in verified) return passkeyFailed(verified.failed)

  // The insert counts the account's passkeys itself (the cap); everything
  // after it in the batch writes only once it stored the passkey.
  const now = Date.now()
  const stored = hasPasskey(verified.credentialId, accountId)
  const used = await batchUsing(db, [nonce.id, claims.id], () =>
    db.batch([
      passkeyInsert(
        db,
        {
          ...verified,
          accountId,
          rpId: claims.rpId,
          createdPlatform: platform,
          label: fields.label,
        },
        now
      ),
      usedTokenInsert(db, nonce, stored),
      usedTokenInsert(db, { id: claims.id, expiresAt: claims.expiresAt }, stored),
      ...(fields.wrap && fields.wrapId
        ? wrapStatements(
            db,
            {
              wrapId: fields.wrapId,
              credentialId: verified.credentialId,
              accountId,
              keyEpoch: account.keyEpoch,
              wrap: fields.wrap,
            },
            now
          )
        : []),
      activityInsert(
        db,
        {
          accountId,
          kind: 'passkey.added',
          sessionId,
          credentialId: verified.credentialId,
        },
        { now, onlyIf: stored }
      ),
    ])
  ).catch(async (error: unknown) => {
    // The same credential stored by a racing request.
    if (await findPasskey(db, verified.credentialId)) return { raced: true as const }
    throw error
  })
  if ('raced' in used)
    return (await existingCredential(c, db, verified.credentialId, accountId))!
  if ('used' in used)
    return used.used === nonce.id
      ? buddiesErrorResponse('replay')
      : passkeyFailed('challenge')
  if (changes(used.result[0]) !== 1) return buddiesErrorResponse('limit')
  return c.json({ ok: true, credentialId: verified.credentialId })
})

// --- Wraps ----------------------------------------------------------------------

/**
 * `POST /passkeys/wrap`: Bearer and signed (op `passkey/wrap`). Stores a
 * wrap for one of the account's credentials at the account's key epoch;
 * repeating a `wrapId` on the same credential is `ok` (ids are unique per
 * credential); a fifth wrap replaces the oldest. Not logged.
 */
const handleWrap = guarded('passkeys/wrap', async (c) => {
  const setup = await ready(c)
  if ('refusal' in setup) return setup.refusal
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return auth.response
  const signed = await signedForToken(c, 'passkey/wrap', auth.account)
  if ('refusal' in signed) return signed.refusal
  const { fields, nonce } = signed
  const credentialId = parseCredentialId(fields.credentialId)
  if (!credentialId) return buddiesErrorResponse('bad_request')
  const { db } = setup
  const { accountId } = auth.account

  /** Why this wrap can't be stored now, or null when it can. */
  const refusal = async (): Promise<Response | null> => {
    const passkey = await findPasskey(db, credentialId)
    if (!passkey || passkey.accountId !== accountId)
      return buddiesErrorResponse('not_found')
    // Wrap ids are the credential's own: another account's never matters.
    if (await findWrap(db, credentialId, fields.wrapId)) return c.json({ ok: true })
    const account = await findPasskeyAccount(db, accountId)
    if (!account || account.keyEpoch !== fields.keyEpoch)
      return buddiesErrorResponse('conflict')
    return null
  }

  const refused = await refusal()
  if (refused) return refused
  const used = await batchUsingToken(db, nonce.id, () =>
    db.batch([
      usedTokenInsert(db, nonce),
      ...wrapStatements(
        db,
        {
          wrapId: fields.wrapId,
          credentialId,
          accountId,
          keyEpoch: fields.keyEpoch,
          wrap: fields.wrap,
        },
        Date.now()
      ),
    ])
  )
  if ('used' in used) return buddiesErrorResponse('replay')
  if (changes(used.result[1]) === 1) return c.json({ ok: true })
  // Something changed between the reads and the write (the key epoch, or
  // the passkey was removed).
  return (await refusal()) ?? buddiesErrorResponse('conflict')
})

// --- Listing and removing ---------------------------------------------------------

/** `GET /passkeys`: Bearer. The account's passkeys, newest first. */
const handleList = guarded('passkeys/list', async (c) => {
  const setup = await ready(c)
  if ('refusal' in setup) return setup.refusal
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return auth.response
  const { db } = setup
  const account = await findPasskeyAccount(db, auth.account.accountId)
  if (!account) return buddiesErrorResponse('unauthorized')
  const [rows, unlocking] = await Promise.all([
    accountPasskeys(db, account.id),
    unlockingCredentials(db, account.id, account.keyEpoch),
  ])
  return c.json({
    ok: true,
    ...(account.userHandle != null ? { userHandle: account.userHandle } : {}),
    passkeys: rows.map((row) => ({
      credentialId: row.credentialId,
      canUnlock: unlocking.has(row.credentialId),
      createdAt: row.createdAt.getTime(),
      ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.getTime() } : {}),
      createdPlatform: row.createdPlatform,
      ...(row.label != null ? { label: row.label } : {}),
      ...(row.aaguid != null ? { aaguid: row.aaguid } : {}),
      backedUp: row.backedUp,
    })),
  })
})

/**
 * `POST /passkeys/remove`: Bearer and signed (op `passkey/remove`),
 * step-up. Deletes the credential and its wraps and logs `passkey.removed`;
 * idempotent.
 */
const handleRemove = guarded('passkeys/remove', async (c) => {
  const setup = await ready(c)
  if ('refusal' in setup) return setup.refusal
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return auth.response
  const signed = await signedForToken(c, 'passkey/remove', auth.account)
  if ('refusal' in signed) return signed.refusal
  const { db } = setup
  const stepUpRefusal = await refuseWithoutStepUp(db, auth.account)
  if (stepUpRefusal) return stepUpRefusal
  const credentialId = parseCredentialId(signed.fields.credentialId)
  if (!credentialId) return buddiesErrorResponse('bad_request')
  const { accountId, sessionId } = auth.account
  const { nonce } = signed
  const used = await batchUsingToken(db, nonce.id, () =>
    db.batch([
      usedTokenInsert(db, nonce),
      activityInsert(
        db,
        { accountId, kind: 'passkey.removed', sessionId, credentialId },
        { onlyIf: hasPasskey(credentialId, accountId) }
      ),
      db
        .delete(passkeys)
        .where(
          and(
            eq(passkeys.credentialId, credentialId),
            eq(passkeys.accountId, accountId)
          )
        ),
    ])
  )
  if ('used' in used) return buddiesErrorResponse('replay')
  return c.json({ ok: true })
})

export const passkeyHandlers = {
  challenge: handleChallenge,
  assert: handleAssert,
  registerOptions: handleRegisterOptions,
  add: handleAdd,
  wrap: handleWrap,
  list: handleList,
  remove: handleRemove,
}
