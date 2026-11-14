import { and, asc, eq, gt, ne, sql } from 'drizzle-orm'
import type { AppContext } from '../types'
import { captureFailure } from '../sentry'
import { decodeSignature } from '../buddies/contracts'
import {
  parseEnvelope,
  readEnvelopeText,
  verifyEd25519,
} from '../buddies/envelope'
import { buddiesErrorResponse } from '../buddies/errorResponse'
import { ACCOUNT_LIMITS, rekeyNewKeyMessage } from './contracts'
import { authenticateAccount, parseJsonOrNull } from './auth'
import { guarded, refuseAtEdge, verifyEnvelope } from './signed'
import {
  accountsDb,
  changes,
  findAccount,
  findAccountByPub,
  findRetiredKey,
  isRetiredKey,
  type AccountsDb,
} from './store'
import { activityInsert, sessionIsLive } from './activity'
import {
  batchUsingToken,
  envelopeNonce,
  findPasskey,
  findUsedToken,
  usedTokenInsert,
} from './passkeyStore'
import {
  accountActivity,
  accountKeyHistory,
  accountSessions,
  accounts,
  passkeyWraps,
  retiredAccountKeys,
} from './schema'
import { STEP_UP_EXEMPT } from './stepUp'
import { accessTokenKeys, signAccessToken } from './tokens'
import { sessionEndedReason } from './sessionStore'
import { parseCredentialId } from './webauthn'
import { syncIndex } from './sync'
import { keyChangeSupporterStatements } from './supporter'

/**
 * Changing the account key (witness-work ADR 0039, `docs/account-key-change.md`):
 * the same account under a new key. `POST /account/rekey` swaps
 * `account_pub` and raises `key_epoch` in one D1 batch that retires the old
 * key, ends every other session, deletes the account's passkey wraps (keeping
 * the one sent), stores the key history blob, and logs it; then every Cloud
 * Sync socket of the account closes (`4005 "key_changed"`).
 * `GET /account/key-history` reads the blob back.
 *
 * Privacy: nothing here logs or reports bodies, keys, the history, wraps,
 * credential ids, account ids, or session ids.
 */

const DAY_MS = 24 * 60 * 60 * 1_000
const MONTH_MS = 30 * DAY_MS
const {
  keyChangeSessionAgeMs,
  keyChangesPerDay,
  keyChangesPer30Days,
  stepUpMs,
} = ACCOUNT_LIMITS

/** 409 `conflict` with the account's key epoch now. */
const conflict = (keyEpoch: number): Response =>
  buddiesErrorResponse('conflict', { extras: { keyEpoch } })

/**
 * Key changes the account counted in a rolling day and 30 days, and when
 * the next one is allowed if either is spent: 429 `rate_limited` with
 * `Retry-After`, or null.
 */
const refuseOverLimits = async (
  db: AccountsDb,
  accountId: string,
  now: number
): Promise<Response | null> => {
  const times = (
    await db
      .select({ at: accountActivity.createdAt })
      .from(accountActivity)
      .where(
        and(
          eq(accountActivity.accountId, accountId),
          eq(accountActivity.kind, 'account.key_changed'),
          gt(accountActivity.createdAt, new Date(now - MONTH_MS))
        )
      )
      .orderBy(asc(accountActivity.createdAt))
      .all()
  ).map((row) => row.at.getTime())
  const today = times.filter((at) => at > now - DAY_MS)
  let waitMs = 0
  if (today.length >= keyChangesPerDay)
    waitMs = today[today.length - keyChangesPerDay] + DAY_MS - now
  if (times.length >= keyChangesPer30Days)
    waitMs = Math.max(
      waitMs,
      times[times.length - keyChangesPer30Days] + MONTH_MS - now
    )
  return waitMs > 0
    ? buddiesErrorResponse('rate_limited', {
        retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1_000)),
      })
    : null
}

/** The same limits as one condition, for the swap's own statement. */
const underLimits = (accountId: string, now: number) =>
  sql`(SELECT COUNT(*) FROM account_activity
      WHERE account_id = ${accountId} AND kind = 'account.key_changed'
        AND created_at > ${now - DAY_MS}) < ${keyChangesPerDay}
    AND (SELECT COUNT(*) FROM account_activity
      WHERE account_id = ${accountId} AND kind = 'account.key_changed'
        AND created_at > ${now - MONTH_MS}) < ${keyChangesPer30Days}`

/** What the key change reads of the caller's session. */
const callerSession = (db: AccountsDb, accountId: string, sessionId: string) =>
  db
    .select({
      createdAt: accountSessions.createdAt,
      expiresAt: accountSessions.expiresAt,
      stepUpAt: accountSessions.stepUpAt,
      stepUpCredentialId: accountSessions.stepUpCredentialId,
    })
    .from(accountSessions)
    .where(
      and(
        eq(accountSessions.id, sessionId),
        eq(accountSessions.accountId, accountId)
      )
    )
    .get()

/**
 * `POST /accounts/v1/account/rekey`: Bearer with a live session (whose
 * token's `kep` is current), step-up and 24 hours of age for a web session,
 * the old key's envelope (op `account/rekey`, used once), and `newSignature`
 * by the new key over the same payload. In order: `disabled`, the register
 * edge tier, 401, `session_too_new`, `step_up_required`, the envelope
 * (`bad_request`, `too_large`, `bad_signature`, `stale`), `newSignature`
 * (`bad_signature`), the same key twice (`bad_request`), the old key not the
 * account's (`forbidden`; 409 `conflict` with `keyEpoch` when it's a key this
 * account retired, or the epoch moved on), `replay`, `passkeyWrap` not the
 * step-up's credential (`not_found`), the new key in use or retired
 * (`conflict`), the limits (`rate_limited`), then the batch. Suspended
 * accounts may.
 */
const handleRekey = guarded('account/rekey', async (c) => {
  const d1 = c.env.ACCOUNTS_DB
  const keys = d1 ? await accessTokenKeys(c.env) : null
  if (!d1 || !keys) return buddiesErrorResponse('disabled')
  const limited = await refuseAtEdge(c, 'inbox/register')
  if (limited) return limited
  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return auth.response
  const db = accountsDb(d1)
  const { accountId, sessionId, platform } = auth.account
  const now = Date.now()

  const session = await callerSession(db, accountId, sessionId)
  if (!session) return buddiesErrorResponse('unauthorized')
  // ADR 0039 §2: a phone attested and checks Face ID itself; a browser needs
  // a day of age and a fresh passkey tap.
  if (!STEP_UP_EXEMPT.includes(platform)) {
    if (now - session.createdAt.getTime() < keyChangeSessionAgeMs)
      return buddiesErrorResponse('session_too_new')
    const stepUpAt = session.stepUpAt?.getTime()
    if (stepUpAt == null || now - stepUpAt > stepUpMs)
      return buddiesErrorResponse('step_up_required')
  }

  const text = await readEnvelopeText(c.req.raw)
  const envelope = text == null ? null : parseEnvelope(text)
  const verified = await verifyEnvelope('account/rekey', envelope)
  if ('refusal' in verified) return verified.refusal
  const { payload, fields } = verified
  const body = parseJsonOrNull(text) as Record<string, unknown>
  const newSignature = decodeSignature(body.newSignature)
  if (
    !newSignature ||
    !(await verifyEd25519(
      fields.newAccountPub,
      rekeyNewKeyMessage(envelope!.payloadBytes),
      newSignature
    ))
  )
    return buddiesErrorResponse('bad_signature')
  if (fields.newAccountPub === payload.accountPub)
    return buddiesErrorResponse('bad_request')

  const account = await findAccount(db, accountId)
  if (!account) return buddiesErrorResponse('unauthorized')
  if (account.accountPub !== payload.accountPub) {
    // Another device changed the key first.
    const retired = await findRetiredKey(db, payload.accountPub)
    return retired?.accountId === accountId
      ? conflict(account.keyEpoch)
      : buddiesErrorResponse('forbidden')
  }
  if (fields.keyEpoch !== account.keyEpoch) return conflict(account.keyEpoch)
  const nonce = await envelopeNonce(payload)
  if (await findUsedToken(db, nonce.id)) return buddiesErrorResponse('replay')

  let wrap: { credentialId: string; wrapId: string; wrap: string } | null = null
  if (fields.passkeyWrap) {
    const credentialId = parseCredentialId(fields.passkeyWrap.credentialId)
    if (!credentialId) return buddiesErrorResponse('bad_request')
    // Only the passkey this session's step-up used, whose PRF made the wrap.
    const passkey = await findPasskey(db, credentialId)
    if (
      credentialId !== session.stepUpCredentialId ||
      passkey?.accountId !== accountId
    )
      return buddiesErrorResponse('not_found')
    wrap = { ...fields.passkeyWrap, credentialId }
  }

  const { newAccountPub } = fields
  if (
    (await findAccountByPub(db, newAccountPub)) ||
    (await findRetiredKey(db, newAccountPub))
  )
    return buddiesErrorResponse('conflict')
  const overLimits = await refuseOverLimits(db, accountId, now)
  if (overLimits) return overLimits

  const oldEpoch = account.keyEpoch
  const newEpoch = oldEpoch + 1
  // Whether this request's swap landed: every statement after it runs only
  // then, so a lost swap writes nothing. The marker is the new key, the new
  // epoch, and this request's `key_changed_at` together. Only a request
  // carrying the same new key in the same millisecond could match a swap it
  // didn't make (another envelope from the device holding that key, since
  // the nonce stops this one twice); its batch then tries to retire the old
  // key again, fails on `retired_account_keys`' primary key, and rolls back
  // whole, answering `conflict` below.
  const committed = sql`EXISTS (SELECT 1 FROM ${accounts}
    WHERE ${accounts.id} = ${accountId}
      AND ${accounts.accountPub} = ${newAccountPub}
      AND ${accounts.keyEpoch} = ${newEpoch}
      AND ${accounts.keyChangedAt} = ${now})`
  const others = and(
    eq(accountSessions.accountId, accountId),
    ne(accountSessions.id, sessionId),
    sql`${accountSessions.revokedAt} IS NULL`,
    gt(accountSessions.expiresAt, new Date(now)),
    committed
  )

  const outcome = await batchUsingToken(db, nonce.id, () =>
    db.batch([
      // The envelope works once (`replay`).
      usedTokenInsert(db, nonce),
      // 1. The swap, only while the key, the epoch, the caller's session,
      // and the limits still hold, and the new key was never retired.
      db
        .update(accounts)
        .set({
          accountPub: newAccountPub,
          keyEpoch: newEpoch,
          keyChangedAt: new Date(now),
        })
        .where(
          and(
            eq(accounts.id, accountId),
            eq(accounts.accountPub, payload.accountPub),
            eq(accounts.keyEpoch, oldEpoch),
            sql`NOT ${isRetiredKey(newAccountPub)}`,
            sessionIsLive(accountId, sessionId, now),
            underLimits(accountId, now)
          )
        ),
      // 2. The old key, retired for good.
      db.insert(retiredAccountKeys).select(
        sql`SELECT ${payload.accountPub}, ${accountId}, ${oldEpoch}, ${now}
          WHERE ${committed}`
      ),
      // 3. The caller's session takes the new epoch (and its new label),
      // before the entries below copy that label.
      db
        .update(accountSessions)
        .set({
          keyEpoch: newEpoch,
          ...(fields.device != null ? { device: fields.device } : {}),
        })
        .where(
          and(
            eq(accountSessions.id, sessionId),
            eq(accountSessions.accountId, accountId),
            committed
          )
        ),
      // 4. Every other live session ends as `key_changed`, logged first;
      // sessions already ended keep why they ended. (Columns in the table's
      // order; see `activityInsert`.)
      db.insert(accountActivity).select(
        sql`SELECT NULL, s.account_id, 'session.revoked',
            s.id, s.platform, s.device, a.id, a.platform, a.device,
            NULL, ${now}, NULL, NULL
          FROM account_sessions AS s
          JOIN account_sessions AS a ON a.id = ${sessionId}
            AND a.account_id = ${accountId}
          WHERE s.account_id = ${accountId} AND s.id != ${sessionId}
            AND s.revoked_at IS NULL AND s.expires_at > ${now}
            AND ${committed}`
      ),
      db
        .update(accountSessions)
        .set({ revokedAt: new Date(now), endedReason: 'key_changed' })
        .where(others),
      // 5. Every wrap held the old key; the step-up's passkey wraps the new.
      db
        .delete(passkeyWraps)
        .where(and(eq(passkeyWraps.accountId, accountId), committed)),
      ...(wrap
        ? [
            db.insert(passkeyWraps).select(
              sql`SELECT ${wrap.wrapId}, ${wrap.credentialId}, ${accountId},
                  ${newEpoch}, ${wrap.wrap}, ${now}
                WHERE ${committed}
                  AND EXISTS (SELECT 1 FROM passkeys
                    WHERE credential_id = ${wrap.credentialId}
                      AND account_id = ${accountId})`
            ),
          ]
        : []),
      // 6. The key history, for the new epoch.
      db.insert(accountKeyHistory).select(
        sql`SELECT ${accountId}, ${newEpoch}, ${fields.history}, ${now}
          WHERE ${committed}
          ON CONFLICT (account_id) DO UPDATE SET
            key_epoch = excluded.key_epoch, blob = excluded.blob,
            updated_at = excluded.updated_at`
      ),
      // ADR 0039 §9: the account's RevenueCat customers leave every other
      // account and are locked to this one.
      ...keyChangeSupporterStatements(db, accountId, committed, now),
      // 7. The change itself.
      activityInsert(
        db,
        { accountId, kind: 'account.key_changed', sessionId },
        { now, onlyIf: committed }
      ),
    ])
  ).catch(async (error: unknown) => {
    // The new key became another account's meanwhile (the batch rolled
    // back, so it isn't this one's).
    if (await findAccountByPub(db, newAccountPub)) return { taken: true as const }
    throw error
  })
  if ('taken' in outcome) return buddiesErrorResponse('conflict')
  if ('used' in outcome) return buddiesErrorResponse('replay')

  if (changes(outcome.result[1]) !== 1) {
    // Lost: to another change, the caller's session ending, or the limits.
    // Re-read which: only a moved key or epoch is a conflict (another device
    // won, so the app drops its new key); a session that ended meanwhile
    // (signed out elsewhere, or past the cap) is 401 with why.
    const current = await findAccount(db, accountId)
    if (!current) return buddiesErrorResponse('unauthorized')
    if (current.accountPub !== payload.accountPub || current.keyEpoch !== oldEpoch)
      return conflict(current.keyEpoch)
    const ended = await sessionEndedReason(db, accountId, sessionId, Date.now())
    if (ended)
      return buddiesErrorResponse('unauthorized', { extras: { reason: ended } })
    if (await findRetiredKey(db, newAccountPub))
      return buddiesErrorResponse('conflict')
    return (
      (await refuseOverLimits(db, accountId, Date.now())) ??
      conflict(current.keyEpoch)
    )
  }

  // Every socket closes; the caller reconnects with the token below.
  if (c.env.ACCOUNT_SYNC_INDEX) {
    try {
      await syncIndex(c.env, accountId).closeForKeyChange({ keyEpoch: newEpoch })
    } catch (error) {
      console.error('accounts: closing sync sockets failed')
      captureFailure(error, 'account/rekey sockets')
    }
  }

  const access = await signAccessToken(keys, {
    accountId,
    sessionId,
    platform,
    keyEpoch: newEpoch,
    sessionExpiresAt: session.expiresAt.getTime(),
  })
  return c.json({ ok: true, keyEpoch: newEpoch, ...access })
})

/**
 * `GET /accounts/v1/account/key-history`: Bearer → `{ ok, keyEpoch,
 * history }`, the blob the last key change stored, or null for an account
 * whose key never changed. Needs a live session. Read edge tier. Not
 * logged.
 */
const handleKeyHistory = guarded('account/key-history', async (c) => {
  const d1 = c.env.ACCOUNTS_DB
  if (!d1) return buddiesErrorResponse('disabled')
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  // Live only: an ended session's leftover token reads nothing.
  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return auth.response
  const db = accountsDb(d1)
  const { accountId } = auth.account
  const row = await db
    .select({ keyEpoch: accounts.keyEpoch, history: accountKeyHistory.blob })
    .from(accounts)
    .leftJoin(accountKeyHistory, eq(accountKeyHistory.accountId, accounts.id))
    .where(eq(accounts.id, accountId))
    .get()
  if (!row) return buddiesErrorResponse('unauthorized')
  return c.json({ ok: true, keyEpoch: row.keyEpoch, history: row.history ?? null })
})

export const rekeyHandlers = { rekey: handleRekey, keyHistory: handleKeyHistory }
