import { and, eq, gt, lt, lte, sql, type SQLWrapper } from 'drizzle-orm'
import { accountInboxes, accounts, inboxSuccessors } from './schema'
import { changes, type AccountsDb } from './store'

/**
 * A Buddies inbox's successor (witness-work ADR 0039 §5): the inbox that
 * replaced it after an account key change. The device that changed the key
 * names it when it deletes the old inbox (`inbox/delete` with `successor`),
 * and a buddy reads it (`inbox/successor`) to check a `pair.reconnect`
 * written with the old key's pairing keys, which anyone holding the old key
 * could forge. Only a link the current key made can be a successor, and the
 * old key opens no session after the change, so it can't name its own inbox.
 *
 * Privacy: inbox and account ids only; nothing here logs them.
 */

const DAY_MS = 24 * 60 * 60 * 1_000
/** How long a successor is kept (and answered) after it was recorded. */
export const INBOX_SUCCESSOR_RETENTION_MS = 90 * DAY_MS

/** `inboxId`'s link to `accountId` is at the account's current key epoch. */
const isCurrentLink = (
  inboxId: string | SQLWrapper,
  accountId: string | SQLWrapper
) =>
  sql`EXISTS (SELECT 1 FROM ${accountInboxes}
    JOIN ${accounts} ON ${accounts.id} = ${accountInboxes.accountId}
    WHERE ${accountInboxes.inboxId} = ${inboxId}
      AND ${accountInboxes.accountId} = ${accountId}
      AND ${accountInboxes.keyEpoch} = ${accounts.keyEpoch})`

/**
 * Whether `inboxId` was first linked to its account at a key epoch below the
 * account's current one, whatever the link's `keyEpoch` says now. Its owner
 * key comes from the account key it was linked under, so the relay refuses
 * its owner-signed requests for good (`src/buddies/route.ts`). One lookup by
 * primary key on each table.
 */
export const isOldKeyLink = async (
  db: AccountsDb,
  inboxId: string
): Promise<boolean> =>
  (await db
    .select({ inboxId: accountInboxes.inboxId })
    .from(accountInboxes)
    .innerJoin(accounts, eq(accounts.id, accountInboxes.accountId))
    .where(
      and(
        eq(accountInboxes.inboxId, inboxId),
        lt(accountInboxes.firstKeyEpoch, accounts.keyEpoch)
      )
    )
    .get()) != null

/**
 * Records `successorId` for `inboxId` only while (in the same statement, so a
 * key change can't slip in between) `inboxId` is linked to the account (or,
 * once deleted, already has a successor of the account's recorded),
 * `successorId` is another inbox linked to it at its current key epoch with
 * no successor of its own (so no cycles), and the caller's session is live
 * at that epoch (a key change ends every other session, so a token that
 * outlives one records nothing). The caller checks that `successorId` is
 * registered.
 *
 * The first record wins while it still qualifies: naming the same successor
 * again refreshes it, and naming another one records nothing. A record that
 * no longer qualifies (its successor's link is behind the account's key
 * epoch, as one the old key made before a key change is) is replaced.
 * Whether it was recorded.
 */
export const recordInboxSuccessor = async (
  db: AccountsDb,
  record: {
    inboxId: string
    successorId: string
    accountId: string
    sessionId: string
    now: number
  }
): Promise<boolean> => {
  const { inboxId, successorId, accountId, sessionId, now } = record
  // Columns in the table's order: inbox_id, successor_id, account_id,
  // recorded_at.
  const result = await db.insert(inboxSuccessors).select(
    sql`SELECT ${inboxId}, ${successorId}, ${accountId}, ${now}
      WHERE ${inboxId} != ${successorId}
        AND (EXISTS (SELECT 1 FROM ${accountInboxes}
            WHERE ${accountInboxes.inboxId} = ${inboxId}
              AND ${accountInboxes.accountId} = ${accountId})
          OR EXISTS (SELECT 1 FROM inbox_successors AS r
            WHERE r.inbox_id = ${inboxId} AND r.account_id = ${accountId}))
        AND ${isCurrentLink(successorId, accountId)}
        AND NOT EXISTS (SELECT 1 FROM inbox_successors AS r
          WHERE r.inbox_id = ${successorId})
        AND EXISTS (SELECT 1 FROM account_sessions AS s
          JOIN ${accounts} ON ${accounts.id} = s.account_id
          WHERE s.id = ${sessionId} AND s.account_id = ${accountId}
            AND s.revoked_at IS NULL AND s.expires_at > ${now}
            AND s.key_epoch = ${accounts.keyEpoch})
      ON CONFLICT (inbox_id) DO UPDATE
        SET successor_id = excluded.successor_id,
          recorded_at = excluded.recorded_at
        WHERE inbox_successors.account_id = excluded.account_id
          AND (inbox_successors.successor_id = excluded.successor_id
            OR NOT ${isCurrentLink(inboxSuccessors.successorId, inboxSuccessors.accountId)})`
  )
  return changes(result) > 0
}

/**
 * The account that recorded a successor for `inboxId`, whether or not it
 * still qualifies, or null. A replaced inbox is never registered again, and
 * a repeat of its deletion finds its account here once its link is gone.
 */
export const findSuccessorAccount = async (
  db: AccountsDb,
  inboxId: string
): Promise<string | null> =>
  (
    await db
      .select({ accountId: inboxSuccessors.accountId })
      .from(inboxSuccessors)
      .where(eq(inboxSuccessors.inboxId, inboxId))
      .get()
  )?.accountId ?? null

/**
 * Drops a replaced inbox's link once the inbox is gone: it can't be
 * registered again, so nothing may act for it through the link.
 */
export const unlinkReplacedInbox = async (
  db: AccountsDb,
  inboxId: string,
  accountId: string
): Promise<void> => {
  await db
    .delete(accountInboxes)
    .where(
      and(
        eq(accountInboxes.inboxId, inboxId),
        eq(accountInboxes.accountId, accountId)
      )
    )
}

/**
 * Drops the record `recordInboxSuccessor` just wrote when the inbox refused
 * the deletion, so a successor is only ever named for a deleted inbox.
 */
export const forgetInboxSuccessor = async (
  db: AccountsDb,
  inboxId: string,
  successorId: string,
  recordedAt: number
): Promise<void> => {
  await db
    .delete(inboxSuccessors)
    .where(
      and(
        eq(inboxSuccessors.inboxId, inboxId),
        eq(inboxSuccessors.successorId, successorId),
        eq(inboxSuccessors.recordedAt, new Date(recordedAt))
      )
    )
}

/**
 * The inbox that replaced `inboxId`, or null. Checked at every read: a
 * successor whose link is no longer at its account's current key epoch isn't
 * named (a key change leaves any successor the old key recorded unanswered,
 * before the device that changed the key names its own), nor is a suspended
 * account's.
 */
export const findInboxSuccessor = async (
  db: AccountsDb,
  inboxId: string,
  now: number = Date.now()
): Promise<string | null> =>
  (
    await db
      .select({ successorId: inboxSuccessors.successorId })
      .from(inboxSuccessors)
      .where(
        and(
          eq(inboxSuccessors.inboxId, inboxId),
          gt(
            inboxSuccessors.recordedAt,
            new Date(now - INBOX_SUCCESSOR_RETENTION_MS)
          ),
          isCurrentLink(inboxSuccessors.successorId, inboxSuccessors.accountId),
          sql`EXISTS (SELECT 1 FROM ${accounts}
            WHERE ${accounts.id} = ${inboxSuccessors.accountId}
              AND ${accounts.status} = 'active')`
        )
      )
      .get()
  )?.successorId ?? null

/** Deletes successors recorded 90 days ago or longer. */
export const pruneInboxSuccessors = async (
  db: AccountsDb,
  now: number = Date.now()
): Promise<void> => {
  await db
    .delete(inboxSuccessors)
    .where(
      lte(
        inboxSuccessors.recordedAt,
        new Date(now - INBOX_SUCCESSOR_RETENTION_MS)
      )
    )
}
