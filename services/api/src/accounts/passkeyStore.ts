import { and, desc, eq, isNull, lte, sql, type SQL } from 'drizzle-orm'
import { bytesToBase64Url, sha256Bytes } from '../crypto'
import { BUDDIES_LIMITS, decodeB64u } from '../buddies/contracts'
import { ACCOUNT_LIMITS, type AccountKeyPayload } from './contracts'
import {
  accounts,
  passkeyWraps,
  passkeys,
  usedTokenIds,
  type AccountStatus,
  type SessionPlatform,
} from './schema'
import { changes, type AccountsDb } from './store'

/**
 * Passkeys, their wraps, the account's user handle, and used ids
 * (challenges, tickets, and signed envelopes' nonces) in the accounts
 * database (witness-work `docs/passkeys-protocol.md`).
 *
 * Privacy: nothing here logs credential ids, user handles, or wraps.
 */

const encoder = new TextEncoder()
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * The handle's tag (`WitnessWork <tag>`): the first 20 bits of
 * `SHA-256(UTF-8("ww-account/v1/passkey-tag\n") ‖ handle)` as 4 Crockford
 * base32 characters.
 */
export const passkeyTag = async (userHandle: string): Promise<string> => {
  const handle = decodeB64u(userHandle) ?? new Uint8Array()
  const prefix = encoder.encode('ww-account/v1/passkey-tag\n')
  const input = new Uint8Array(prefix.length + handle.length)
  input.set(prefix)
  input.set(handle, prefix.length)
  const digest = await sha256Bytes(input)
  const bits = (digest[0] << 12) | (digest[1] << 4) | (digest[2] >> 4)
  let tag = ''
  for (let shift = 15; shift >= 0; shift -= 5) tag += CROCKFORD[(bits >> shift) & 31]
  return tag
}

export const passkeyUserName = async (userHandle: string): Promise<string> =>
  `WitnessWork ${await passkeyTag(userHandle)}`


export interface PasskeyAccount {
  id: string
  accountPub: string
  status: AccountStatus
  keyEpoch: number
  userHandle: string | null
}

const passkeyAccountColumns = {
  id: accounts.id,
  accountPub: accounts.accountPub,
  status: accounts.status,
  keyEpoch: accounts.keyEpoch,
  userHandle: accounts.passkeyUserHandle,
}

export const findPasskeyAccount = async (
  db: AccountsDb,
  accountId: string
): Promise<PasskeyAccount | null> =>
  (await db
    .select(passkeyAccountColumns)
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get()) ?? null

export const findPasskeyAccountByPub = async (
  db: AccountsDb,
  accountPub: string
): Promise<PasskeyAccount | null> =>
  (await db
    .select(passkeyAccountColumns)
    .from(accounts)
    .where(eq(accounts.accountPub, accountPub))
    .get()) ?? null

/** A fresh user handle: b64u of 32 random bytes. */
export const newUserHandle = (): string =>
  bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))

/**
 * The account's user handle, minted with a conditional write the first time
 * (`… WHERE passkey_user_handle IS NULL`), then read back: two devices asking
 * at once get the same one. Null only when the account is gone.
 */
export const ensureUserHandle = async (
  db: AccountsDb,
  accountId: string
): Promise<string | null> => {
  await db
    .update(accounts)
    .set({ passkeyUserHandle: newUserHandle() })
    .where(and(eq(accounts.id, accountId), isNull(accounts.passkeyUserHandle)))
  const row = await db
    .select({ handle: accounts.passkeyUserHandle })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get()
  return row?.handle ?? null
}

export type PasskeyRow = typeof passkeys.$inferSelect

export const findPasskey = async (
  db: AccountsDb,
  credentialId: string
): Promise<PasskeyRow | null> =>
  (await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.credentialId, credentialId))
    .get()) ?? null

/** The account's passkeys, newest first. */
export const accountPasskeys = (
  db: AccountsDb,
  accountId: string
): Promise<PasskeyRow[]> =>
  db
    .select()
    .from(passkeys)
    .where(eq(passkeys.accountId, accountId))
    .orderBy(desc(passkeys.createdAt), desc(sql`rowid`))
    .all()

/** What storing a verified registration writes. */
export interface NewPasskey {
  credentialId: string
  accountId: string
  publicKey: string
  counter: number
  transports: string[] | null
  deviceType: 'singleDevice' | 'multiDevice'
  backedUp: boolean
  aaguid: string | null
  rpId: string
  createdPlatform: SessionPlatform
  label: string | null
}

/**
 * Stores a passkey, only while the account has fewer than
 * `passkeysPerAccount`, counted in the same statement, so parallel adds can't
 * pass the cap between a count and an insert (it writes no row then; check
 * `changes`). A credential id already stored fails the statement.
 */
export const passkeyInsert = (db: AccountsDb, passkey: NewPasskey, now: number) =>
  db.insert(passkeys).select(
    sql`SELECT ${passkey.credentialId}, ${passkey.accountId}, ${passkey.publicKey},
        ${passkey.counter},
        ${passkey.transports ? JSON.stringify(passkey.transports) : null},
        ${passkey.deviceType}, ${passkey.backedUp ? 1 : 0}, ${passkey.aaguid},
        ${passkey.rpId}, ${passkey.createdPlatform}, ${passkey.label}, ${now}, NULL
      WHERE (SELECT COUNT(*) FROM passkeys WHERE account_id = ${passkey.accountId})
        < ${ACCOUNT_LIMITS.passkeysPerAccount}`
  )

/** Whether the account has this credential (a condition for a batch's statements). */
export const hasPasskey = (credentialId: string, accountId: string) =>
  sql`EXISTS (SELECT 1 FROM passkeys
    WHERE credential_id = ${credentialId} AND account_id = ${accountId})`

export interface WrapView {
  wrapId: string
  wrap: string
  keyEpoch: number
}

/** A credential's wraps for `keyEpoch`, newest first. */
export const credentialWraps = async (
  db: AccountsDb,
  credentialId: string,
  keyEpoch: number
): Promise<WrapView[]> =>
  db
    .select({
      wrapId: passkeyWraps.wrapId,
      wrap: passkeyWraps.wrap,
      keyEpoch: passkeyWraps.keyEpoch,
    })
    .from(passkeyWraps)
    .where(
      and(
        eq(passkeyWraps.credentialId, credentialId),
        eq(passkeyWraps.keyEpoch, keyEpoch)
      )
    )
    .orderBy(desc(passkeyWraps.createdAt), desc(sql`rowid`))
    .all()

/** Credential ids of the account with a wrap for `keyEpoch`. */
export const unlockingCredentials = async (
  db: AccountsDb,
  accountId: string,
  keyEpoch: number
): Promise<Set<string>> =>
  new Set(
    (
      await db
        .selectDistinct({ credentialId: passkeyWraps.credentialId })
        .from(passkeyWraps)
        .where(
          and(
            eq(passkeyWraps.accountId, accountId),
            eq(passkeyWraps.keyEpoch, keyEpoch)
          )
        )
        .all()
    ).map((row) => row.credentialId)
  )

/** A credential's wrap by its id (wrap ids are unique per credential only). */
export const findWrap = async (
  db: AccountsDb,
  credentialId: string,
  wrapId: string
) =>
  (await db
    .select()
    .from(passkeyWraps)
    .where(
      and(
        eq(passkeyWraps.credentialId, credentialId),
        eq(passkeyWraps.wrapId, wrapId)
      )
    )
    .get()) ?? null

/**
 * Stores a wrap only while the credential is the account's and the account
 * is still at `keyEpoch`, checked in the same statement; then keeps the
 * credential's newest four. Ignores a `wrapId` the credential already has.
 * Returns whether it stored anything.
 */
export const wrapStatements = (
  db: AccountsDb,
  wrap: {
    wrapId: string
    credentialId: string
    accountId: string
    keyEpoch: number
    wrap: string
  },
  now: number
) => [
  db.insert(passkeyWraps).select(
    sql`SELECT ${wrap.wrapId}, ${wrap.credentialId}, ${wrap.accountId},
        ${wrap.keyEpoch}, ${wrap.wrap}, ${now}
      WHERE EXISTS (SELECT 1 FROM accounts
          WHERE id = ${wrap.accountId} AND key_epoch = ${wrap.keyEpoch})
        AND EXISTS (SELECT 1 FROM passkeys
          WHERE credential_id = ${wrap.credentialId}
            AND account_id = ${wrap.accountId})
      ON CONFLICT DO NOTHING`
  ),
  db.delete(passkeyWraps).where(
    sql`${passkeyWraps.credentialId} = ${wrap.credentialId}
      AND ${passkeyWraps.wrapId} NOT IN (
        SELECT wrap_id FROM passkey_wraps WHERE credential_id = ${wrap.credentialId}
        ORDER BY created_at DESC, rowid DESC LIMIT ${ACCOUNT_LIMITS.wrapsPerCredential})`
  ),
] as const

// --- Used ids -----------------------------------------------------------------

/**
 * Something that works once: a challenge's or ticket's id, or a signed
 * envelope's nonce (`envelopeNonce`), with when it stops mattering.
 */
export interface UsedId {
  id: string
  /** Epoch ms; pruned after. */
  expiresAt: number
}

export const usedTokenInsert = (
  db: AccountsDb,
  used: UsedId & { sessionId?: string | null; requestHash?: string | null },
  /** Insert only while this holds (the statement then writes nothing). */
  onlyIf?: SQL
) =>
  onlyIf
    ? db.insert(usedTokenIds).select(
        sql`SELECT ${used.id}, ${used.expiresAt}, ${used.sessionId ?? null},
            ${used.requestHash ?? null} WHERE ${onlyIf}`
      )
    : db.insert(usedTokenIds).values({
        id: used.id,
        expiresAt: new Date(used.expiresAt),
        sessionId: used.sessionId ?? null,
        requestHash: used.requestHash ?? null,
      })

export const findUsedToken = async (db: AccountsDb, id: string) =>
  (await db.select().from(usedTokenIds).where(eq(usedTokenIds.id, id)).get()) ??
  null

/**
 * A signed envelope's nonce as a used id: per account key, until the
 * envelope's `ts` leaves the 5 minutes `verifyEnvelope` accepts. Recorded in
 * the same D1 batch as the action it signs, so each envelope works once
 * (409 `replay`).
 */
export const envelopeNonce = async (payload: AccountKeyPayload): Promise<UsedId> => ({
  id: bytesToBase64Url(
    await sha256Bytes(
      encoder.encode(
        `ww-account/v1/envelope-nonce\n${payload.accountPub}\n${payload.nonce}`
      )
    )
  ),
  expiresAt: payload.ts + BUDDIES_LIMITS.timestampSkewMs,
})

/**
 * Runs `batch`, whose statements insert the used ids `ids`. A batch that
 * fails because another request used one of them first is `used` (that id,
 * the first of `ids` found); any other failure throws.
 */
export const batchUsing = async <T>(
  db: AccountsDb,
  ids: readonly string[],
  batch: () => Promise<T>
): Promise<{ used: string } | { result: T }> => {
  try {
    return { result: await batch() }
  } catch (error) {
    for (const id of ids) if (await findUsedToken(db, id)) return { used: id }
    throw error
  }
}

/** `batchUsing` for one id. */
export const batchUsingToken = <T>(
  db: AccountsDb,
  id: string,
  batch: () => Promise<T>
) => batchUsing(db, [id], batch)

/**
 * Records a signed envelope's nonce on its own, for an action outside D1
 * (`backup/delete`, before R2). False when it was already used.
 */
export const claimNonce = async (db: AccountsDb, nonce: UsedId): Promise<boolean> =>
  changes(
    await db
      .insert(usedTokenIds)
      .values({ id: nonce.id, expiresAt: new Date(nonce.expiresAt) })
      .onConflictDoNothing()
  ) === 1

/** Deletes used ids whose tokens have expired. Run hourly by the cron. */
export const pruneUsedTokens = async (
  db: AccountsDb,
  now: number = Date.now()
): Promise<number> =>
  changes(
    await db.delete(usedTokenIds).where(lte(usedTokenIds.expiresAt, new Date(now)))
  )
