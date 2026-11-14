import { and, asc, eq, lt, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { bytesToBase64Url } from '../crypto'
import {
  accountInboxes,
  accountStatusEvents,
  accounts,
  retiredAccountKeys,
  type AccountStatus,
  type AccountStatusReason,
} from './schema'
import { activityInsert } from './activity'
import { buddiesErrorResponse } from '../buddies/errorResponse'

export const accountsDb = (d1: D1Database) => drizzle(d1)
export type AccountsDb = ReturnType<typeof accountsDb>

/** Rows a D1 write changed (Drizzle hands back D1's result for writes). */
export const changes = (result: unknown): number =>
  (result as { meta?: { changes?: number } }).meta?.changes ?? 0

/** A fresh account id: b64u of 16 random bytes. */
export const newAccountId = (): string =>
  bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))

export interface AccountRecord {
  id: string
  accountPub: string
  status: AccountStatus
  /** Raised by each key change (ADR 0039); `0` for a new account. */
  keyEpoch: number
}

const accountColumns = {
  id: accounts.id,
  accountPub: accounts.accountPub,
  status: accounts.status,
  keyEpoch: accounts.keyEpoch,
}

export const findAccount = async (
  db: AccountsDb,
  accountId: string
): Promise<AccountRecord | null> =>
  (await db
    .select(accountColumns)
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get()) ?? null

export const findAccountByPub = async (
  db: AccountsDb,
  accountPub: string
): Promise<AccountRecord | null> =>
  (await db
    .select(accountColumns)
    .from(accounts)
    .where(eq(accounts.accountPub, accountPub))
    .get()) ?? null

/** When the account key last changed (epoch ms), or null if it never has. */
export const findKeyChangedAt = async (
  db: AccountsDb,
  accountId: string
): Promise<number | null> =>
  (
    await db
      .select({ at: accounts.keyChangedAt })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .get()
  )?.at?.getTime() ?? null

/** A key a key change retired (ADR 0039). */
export interface RetiredKey {
  accountId: string
  /** The account's key epoch while this was its key. */
  keyEpoch: number
  /** When it was retired, epoch ms. */
  retiredAt: number
}

export const findRetiredKey = async (
  db: AccountsDb,
  accountPub: string
): Promise<RetiredKey | null> => {
  const row = await db
    .select({
      accountId: retiredAccountKeys.accountId,
      keyEpoch: retiredAccountKeys.keyEpoch,
      retiredAt: retiredAccountKeys.retiredAt,
    })
    .from(retiredAccountKeys)
    .where(eq(retiredAccountKeys.accountPub, accountPub))
    .get()
  return row ? { ...row, retiredAt: row.retiredAt.getTime() } : null
}

/** Whether `accountPub` is retired (a condition for a batch's statements). */
export const isRetiredKey = (accountPub: string) =>
  sql`EXISTS (SELECT 1 FROM ${retiredAccountKeys}
    WHERE ${retiredAccountKeys.accountPub} = ${accountPub})`

/** 403 `key_retired`, with when the key changed (`changedAt`, epoch ms). */
export const keyRetiredResponse = (retired: RetiredKey): Response =>
  buddiesErrorResponse('key_retired', {
    extras: { changedAt: retired.retiredAt },
  })

/**
 * 403 `key_retired` when a key change retired `accountPub` (ADR 0039); null
 * otherwise. Every way into an account asks before its attestation, ticket,
 * or Turnstile, and again when its write found the key gone.
 */
export const refuseRetiredKey = async (
  db: AccountsDb,
  accountPub: string
): Promise<Response | null> => {
  const retired = await findRetiredKey(db, accountPub)
  return retired ? keyRetiredResponse(retired) : null
}

/**
 * The account for this public key, created with `newId` if there is none,
 * or `retired` for a key a key change retired, which never creates one
 * (checked in the insert itself, so a key retired a moment ago can't slip
 * in). Idempotent: the same key always gets the same account, including when
 * two devices register it at once.
 */
export const registerAccount = async (
  db: AccountsDb,
  accountPub: string,
  newId: () => string
): Promise<{ account: AccountRecord } | { retired: RetiredKey }> => {
  const existing = await findAccountByPub(db, accountPub)
  if (existing) return { account: existing }
  const retiredBefore = await findRetiredKey(db, accountPub)
  if (retiredBefore) return { retired: retiredBefore }
  // `account.created` only when this insert made the row: a racing device
  // that won leaves no row under this id.
  const id = newId()
  await db.batch([
    // Columns in the table's order (see `activityInsert`): id, account_pub,
    // status, created_at, passkey_user_handle, key_epoch, created_via,
    // key_changed_at. The literals are the schema's defaults; an insert-select
    // because a plain insert can't carry the retired-key condition.
    db.insert(accounts).select(
      sql`SELECT ${id}, ${accountPub}, 'active', ${Date.now()}, NULL, 0, 'app', NULL
        WHERE NOT ${isRetiredKey(accountPub)}
        ON CONFLICT (account_pub) DO NOTHING`
    ),
    activityInsert(
      db,
      { accountId: id, kind: 'account.created' },
      { onlyIf: sql`EXISTS (SELECT 1 FROM accounts WHERE id = ${id})` }
    ),
  ])
  const account = await findAccountByPub(db, accountPub)
  if (account) return { account }
  const retired = await findRetiredKey(db, accountPub)
  if (retired) return { retired }
  throw new Error('accounts: registered account is missing')
}

/** The account that owns this inbox, or null when none has claimed it. */
export const findInboxAccount = async (
  db: AccountsDb,
  inboxId: string
): Promise<AccountRecord | null> =>
  (await db
    .select(accountColumns)
    .from(accountInboxes)
    .innerJoin(accounts, eq(accounts.id, accountInboxes.accountId))
    .where(eq(accountInboxes.inboxId, inboxId))
    .get()) ?? null

/**
 * Links the inbox to the account unless it's already linked. Returns the
 * account the inbox belongs to afterwards, which differs from `accountId` only
 * when another account linked it first, with its status as read after the
 * link was written.
 *
 * A new link goes in the account's activity (`buddies.inbox_linked`, naming
 * `sessionId` when a bearer session linked it) in the same batch; the batch
 * is atomic, so an account that loses a race logs nothing.
 *
 * `keyEpoch` is the epoch of the key that signed the link's proof, as read
 * with that key, never re-read here: a key change landing in between leaves
 * the link at the old epoch, so it can't be a successor (ADR 0039 §5). It's
 * also the link's `firstKeyEpoch`, which never moves.
 */
export const linkInbox = async (
  db: AccountsDb,
  inboxId: string,
  accountId: string,
  keyEpoch: number,
  sessionId: string | null = null
): Promise<AccountRecord> => {
  await db.batch([
    activityInsert(
      db,
      { accountId, kind: 'buddies.inbox_linked', sessionId },
      {
        onlyIf: sql`NOT EXISTS (SELECT 1 FROM ${accountInboxes}
          WHERE ${accountInboxes.inboxId} = ${inboxId})`,
      }
    ),
    db
      .insert(accountInboxes)
      .values({ inboxId, accountId, keyEpoch, firstKeyEpoch: keyEpoch })
      .onConflictDoNothing({ target: accountInboxes.inboxId }),
  ])
  const owner = await findInboxAccount(db, inboxId)
  if (!owner) throw new Error('accounts: linked inbox is missing')
  return owner
}

/**
 * Moves an existing link up to `keyEpoch`, the epoch of the key that signed a
 * new proof for it (ADR 0039 §5); never down, and never another account's.
 * Only successor eligibility follows it: `firstKeyEpoch` stays, so an inbox
 * the old key made still refuses owner-signed requests.
 */
export const confirmInboxLink = async (
  db: AccountsDb,
  inboxId: string,
  accountId: string,
  keyEpoch: number
): Promise<void> => {
  await db
    .update(accountInboxes)
    .set({ keyEpoch })
    .where(
      and(
        eq(accountInboxes.inboxId, inboxId),
        eq(accountInboxes.accountId, accountId),
        lt(accountInboxes.keyEpoch, keyEpoch)
      )
    )
}

export const accountInboxIds = async (
  db: AccountsDb,
  accountId: string
): Promise<string[]> =>
  (
    await db
      .select({ inboxId: accountInboxes.inboxId })
      .from(accountInboxes)
      .where(eq(accountInboxes.accountId, accountId))
      .all()
  ).map((row) => row.inboxId)

/**
 * Sets the status and records why, in one batch. A change also goes in the
 * account's activity (`account.suspended`/`.reinstated`), without the reason.
 */
export const setAccountStatus = async (
  db: AccountsDb,
  accountId: string,
  status: AccountStatus,
  reason: AccountStatusReason
): Promise<void> => {
  await db.batch([
    activityInsert(
      db,
      {
        accountId,
        kind: status === 'suspended' ? 'account.suspended' : 'account.reinstated',
      },
      {
        onlyIf: sql`EXISTS (SELECT 1 FROM accounts
          WHERE id = ${accountId} AND status != ${status})`,
      }
    ),
    db.update(accounts).set({ status }).where(eq(accounts.id, accountId)),
    db.insert(accountStatusEvents).values({ accountId, status, reason }),
  ])
}

/**
 * What `GET /account` (and the legacy `account/info`) shows the account's own
 * devices: its row, the inboxes it owns, and when its status changed. Status
 * reasons stay with moderation.
 */
export interface AccountInfo extends AccountRecord {
  createdAt: number
  inboxIds: string[]
  statusChanges: { status: AccountStatus; createdAt: number }[]
}

export const findAccountInfo = async (
  db: AccountsDb,
  by: { accountPub: string } | { accountId: string }
): Promise<AccountInfo | null> => {
  const account = await db
    .select({ ...accountColumns, createdAt: accounts.createdAt })
    .from(accounts)
    .where(
      'accountId' in by
        ? eq(accounts.id, by.accountId)
        : eq(accounts.accountPub, by.accountPub)
    )
    .get()
  if (!account) return null
  const [inboxIds, statusChanges] = await Promise.all([
    accountInboxIds(db, account.id),
    db
      .select({
        status: accountStatusEvents.status,
        createdAt: accountStatusEvents.createdAt,
      })
      .from(accountStatusEvents)
      .where(eq(accountStatusEvents.accountId, account.id))
      .orderBy(asc(accountStatusEvents.id))
      .all(),
  ])
  return {
    ...account,
    createdAt: account.createdAt.getTime(),
    inboxIds,
    statusChanges: statusChanges.map((change) => ({
      status: change.status,
      createdAt: change.createdAt.getTime(),
    })),
  }
}
