import { and, desc, eq, lt, sql, type SQL } from 'drizzle-orm'
import {
  accountActivity,
  accountSessions,
  type ActivityKind,
  type SessionMethod,
  type SessionPlatform,
} from './schema'
import { changes, type AccountsDb } from './store'
import type { ActivityIdKeys } from './tokens'
import { sealActivityId } from './activityIds'

/**
 * The account activity log (witness-work ADR 0028): a security history the
 * User sees in Settings → Account → Activity. The server writes every entry;
 * no route lets a client add one.
 *
 * Recording: `activityInsert` is one statement for the action's own D1 batch,
 * so neither lands without the other; `recordActivity` runs it alone, for
 * actions outside D1 (R2, a Durable Object). Each names the session it's
 * about and, for `session.revoked`/`.replaced`, the session that ended it.
 * Their platform and sealed device label are copied from the account's own
 * session rows (never another account's), so the entry outlives them.
 *
 * Privacy: no IP, location, user agent, or content, and nothing about
 * buddies. Nothing here logs or reports account ids, session ids, labels, or
 * slot ids.
 */

const DAY_MS = 24 * 60 * 60 * 1_000

export const ACTIVITY_LIMITS = {
  /** Entries are deleted this long after they were written. */
  retentionMs: 400 * DAY_MS,
  /** `backup.downloaded` once per slot and session this often. */
  downloadDedupeMs: DAY_MS,
  /** Entries per page, by default and at most. */
  pageSize: 50,
  maxPageSize: 100,
} as const

export interface ActivityInput {
  accountId: string
  kind: ActivityKind
  /** The session the entry is about, or that did it. */
  sessionId?: string | null
  /** The session that ended `sessionId`. */
  actorSessionId?: string | null
  /** The backup slot; null for every slot. */
  slotId?: string | null
  /** `session.opened` and `.renewed`: how the session opened. */
  method?: SessionMethod | null
  /** `passkey.*`: the credential. */
  credentialId?: string | null
}

export interface ActivityOptions {
  now?: number
  /** Writes the entry only when this holds (evaluated in the same statement). */
  onlyIf?: SQL
}

/**
 * The INSERT for one entry, to put in the action's batch (before the
 * statement that changes what `onlyIf` checks).
 *
 * `insert().select(sql)` names every column, so a SELECT into
 * `account_activity` yields them in the table's order, starting with a NULL
 * `id` (SQLite assigns it): id, account_id, kind, session_id,
 * session_platform, session_device, actor_session_id, actor_platform,
 * actor_device, slot_id, created_at, method, credential_id.
 */
export const activityInsert = (
  db: AccountsDb,
  input: ActivityInput,
  { now = Date.now(), onlyIf }: ActivityOptions = {}
) =>
  db.insert(accountActivity).select(
    sql`SELECT NULL, ${input.accountId}, ${input.kind},
      ${input.sessionId ?? null}, s.platform, s.device,
      ${input.actorSessionId ?? null}, a.platform, a.device,
      ${input.slotId ?? null}, ${now},
      ${input.method ?? null}, ${input.credentialId ?? null}
    FROM (SELECT 1)
    LEFT JOIN account_sessions AS s
      ON s.id = ${input.sessionId ?? null} AND s.account_id = ${input.accountId}
    LEFT JOIN account_sessions AS a
      ON a.id = ${input.actorSessionId ?? null} AND a.account_id = ${input.accountId}
    WHERE ${onlyIf ?? sql`1`}`
  )

/** Records one entry on its own, for actions outside the accounts database. */
export const recordActivity = async (
  db: AccountsDb,
  input: ActivityInput,
  options?: ActivityOptions
): Promise<void> => {
  await activityInsert(db, input, options)
}

/**
 * `backup.downloaded`, unless the same session (or, before sessions, any
 * legacy call) logged this slot within the last day.
 */
export const recordBackupDownload = (
  db: AccountsDb,
  input: { accountId: string; sessionId: string | null; slotId: string },
  now: number = Date.now()
): Promise<void> =>
  recordActivity(
    db,
    { ...input, kind: 'backup.downloaded' },
    {
      now,
      onlyIf: sql`NOT EXISTS (SELECT 1 FROM account_activity
        WHERE account_id = ${input.accountId}
          AND kind = 'backup.downloaded'
          AND slot_id = ${input.slotId}
          AND session_id IS ${input.sessionId}
          AND created_at > ${now - ACTIVITY_LIMITS.downloadDedupeMs})`,
    }
  )

/** A session an entry names, as the wire shows it. */
export interface ActivitySessionView {
  sessionId: string
  platform?: SessionPlatform
  /** Sealed; only the account's devices can open it. */
  device?: string
}

export interface ActivityEntry {
  /**
   * Opaque to clients, and sealed for the account (src/accounts/activityIds.ts);
   * also the next page's cursor.
   */
  id: string
  kind: ActivityKind
  createdAt: number
  session?: ActivitySessionView
  actor?: ActivitySessionView
  slotId?: string
  method?: SessionMethod
  credentialId?: string
}

const sessionView = (
  sessionId: string | null,
  platform: SessionPlatform | null,
  device: string | null
): ActivitySessionView | undefined =>
  sessionId == null
    ? undefined
    : {
        sessionId,
        ...(platform != null ? { platform } : {}),
        ...(device != null ? { device } : {}),
      }

/**
 * The account's entries, newest first, older than the row id `before` when
 * given. Ids and the cursor are sealed under `idKeys` (the current secret's).
 */
export const listActivity = async (
  db: AccountsDb,
  accountId: string,
  {
    before,
    limit,
    idKeys,
  }: { before?: number; limit: number; idKeys: ActivityIdKeys }
): Promise<{ activity: ActivityEntry[]; nextCursor: string | null }> => {
  const rows = await db
    .select()
    .from(accountActivity)
    .where(
      and(
        eq(accountActivity.accountId, accountId),
        before != null ? lt(accountActivity.id, before) : undefined
      )
    )
    .orderBy(desc(accountActivity.id))
    .limit(limit + 1)
    .all()
  const page = rows.slice(0, limit)
  const ids = await Promise.all(
    page.map((row) => sealActivityId(idKeys, accountId, row.id))
  )
  const activity = page.map((row, index): ActivityEntry => {
    const session = sessionView(
      row.sessionId,
      row.sessionPlatform,
      row.sessionDevice
    )
    const actor = sessionView(
      row.actorSessionId,
      row.actorPlatform,
      row.actorDevice
    )
    return {
      id: ids[index],
      kind: row.kind,
      createdAt: row.createdAt.getTime(),
      ...(session ? { session } : {}),
      ...(actor ? { actor } : {}),
      ...(row.slotId != null ? { slotId: row.slotId } : {}),
      ...(row.method != null ? { method: row.method } : {}),
      ...(row.credentialId != null ? { credentialId: row.credentialId } : {}),
    }
  })
  return {
    activity,
    nextCursor:
      rows.length > limit && page.length > 0 ? ids[ids.length - 1] : null,
  }
}


/** Deletes entries older than 400 days. Run hourly by the cron. */
export const pruneActivity = async (
  db: AccountsDb,
  now: number = Date.now()
): Promise<number> =>
  changes(
    await db
      .delete(accountActivity)
      .where(
        lt(accountActivity.createdAt, new Date(now - ACTIVITY_LIMITS.retentionMs))
      )
  )

/** True while the session is live (not revoked, not expired), for `onlyIf`. */
export const sessionIsLive = (
  accountId: string,
  sessionId: string,
  now: number
): SQL =>
  sql`EXISTS (SELECT 1 FROM ${accountSessions}
    WHERE ${accountSessions.id} = ${sessionId}
      AND ${accountSessions.accountId} = ${accountId}
      AND ${accountSessions.revokedAt} IS NULL
      AND ${accountSessions.expiresAt} > ${now})`
