import { and, desc, eq, inArray, lt, lte, notInArray, sql, type SQL } from 'drizzle-orm'
import type { Environment } from '../types'
import {
  REVENUECAT_API_ORIGIN,
  countsWebSandboxSubscriptions,
  fetchSupporterStatus,
  type SupporterStatus,
} from '../revenuecat'
import {
  accountRevenueCatCustomers,
  revenueCatCustomerLocks,
  revenueCatCustomers,
  revenueCatWebhookEvents,
} from './schema'
import { accountsDb, changes, type AccountsDb } from './store'

/**
 * Supporter status on the server account (witness-work ADR 0029). The app
 * links the RevenueCat customer it's logged in as to its account
 * (`linkCustomer`), RevenueCat's webhook keeps each linked customer's record
 * current (`refreshCustomer`), and every account-scoped Supporter check asks
 * `isAccountSupporter`, which answers from those records.
 *
 * Nothing is ever stored from a client's say-so: a record is always what
 * RevenueCat's REST API answered. Who counts is ADR 0014's rule
 * (`fetchSupporterStatus`).
 *
 * Privacy: app user ids are RevenueCat capabilities and account ids are
 * account ids; nothing here logs or reports either.
 */

export const SUPPORTER_LINK_LIMITS = {
  /** Customers one account links (several phones, a moved account). */
  customersPerAccount: 5,
  /** Accounts one customer is linked to (devices before a handoff joins them). */
  accountsPerCustomer: 5,
  /**
   * A record read from RevenueCat this recently is the answer; older ones are
   * read again first. Catches a webhook RevenueCat gave up on within a day.
   */
  freshMs: 24 * 60 * 60_000,
  /** How long handled webhook event ids are kept for deduplication. */
  webhookEventRetentionMs: 30 * 24 * 60 * 60_000,
  /** A key change locks the account's customers to it this long (ADR 0039 §9). */
  keyChangeLockMs: 90 * 24 * 60 * 60_000,
} as const

/**
 * Linking a customer a key change locked to another account (ADR 0039 §9):
 * 409 `conflict` with `reason: "customer_locked"`.
 */
export class CustomerLockedError extends Error {
  constructor() {
    super('revenuecat: customer locked to another account')
    this.name = 'CustomerLockedError'
  }
}

/**
 * Whether a key change locked one of `ids` (a customer's app user ids) to an
 * account other than `accountId`, and `accountId` doesn't still link that
 * customer: an account linked before the change may link it again; a new one
 * may not.
 */
const lockedElsewhere = (ids: string[], accountId: string, now: number) =>
  sql`EXISTS (SELECT 1 FROM revenuecat_customer_locks k
    WHERE k.app_user_id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `
    )})
      AND k.account_id != ${accountId}
      AND k.locked_until > ${now}
      AND NOT EXISTS (SELECT 1 FROM account_revenuecat_customers l
        JOIN revenuecat_customers c ON c.app_user_id = l.app_user_id
        WHERE l.account_id = ${accountId}
          AND (c.app_user_id = k.app_user_id
            OR c.original_app_user_id = k.app_user_id)))`

/** RevenueCat's ids for one customer, as `COALESCE`d in SQL. */
const customerIdentity = (table: string) =>
  sql.raw(`COALESCE(${table}.original_app_user_id, ${table}.app_user_id)`)

/**
 * The statements a key change adds to its batch, gated on `committed` (ADR
 * 0039 §9), for each customer the account links. A customer is the
 * account's from its earliest link to it, under any of the customer's ids.
 * - Locked to the account for `keyChangeLockMs` (by the id it linked and by
 *   RevenueCat's original id), only when no other account links it from as
 *   early or earlier: a later linker's change never locks out the owner.
 * - Unlinked from other accounts that first linked it later than that.
 *   Earlier links stay, and so do the account's own.
 */
export const keyChangeSupporterStatements = (
  db: AccountsDb,
  accountId: string,
  committed: SQL,
  now: number
) => [
  db.insert(revenueCatCustomerLocks).select(
    sql`SELECT ids.id, ${accountId},
        ${now + SUPPORTER_LINK_LIMITS.keyChangeLockMs}
      FROM (
        SELECT l.app_user_id AS id, ${customerIdentity('c')} AS who
          FROM account_revenuecat_customers l
          JOIN revenuecat_customers c ON c.app_user_id = l.app_user_id
          WHERE l.account_id = ${accountId}
        UNION
        SELECT c.original_app_user_id, c.original_app_user_id
          FROM account_revenuecat_customers l
          JOIN revenuecat_customers c ON c.app_user_id = l.app_user_id
          WHERE l.account_id = ${accountId}
            AND c.original_app_user_id IS NOT NULL
      ) AS ids
      WHERE ${committed}
        AND NOT EXISTS (SELECT 1 FROM account_revenuecat_customers o
          JOIN revenuecat_customers oc ON oc.app_user_id = o.app_user_id
          WHERE o.account_id != ${accountId}
            AND ${customerIdentity('oc')} = ids.who
            AND o.first_linked_at <= (
              SELECT MIN(m.first_linked_at) FROM account_revenuecat_customers m
                JOIN revenuecat_customers mc ON mc.app_user_id = m.app_user_id
                WHERE m.account_id = ${accountId}
                  AND ${customerIdentity('mc')} = ids.who))
      ON CONFLICT (app_user_id) DO UPDATE SET
        account_id = excluded.account_id, locked_until = excluded.locked_until`
  ),
  db.delete(accountRevenueCatCustomers).where(
    sql`account_revenuecat_customers.account_id != ${accountId}
      AND ${committed}
      AND EXISTS (SELECT 1 FROM account_revenuecat_customers own
        JOIN revenuecat_customers oc ON oc.app_user_id = own.app_user_id
        JOIN revenuecat_customers tc
          ON tc.app_user_id = account_revenuecat_customers.app_user_id
        WHERE own.account_id = ${accountId}
          AND ${customerIdentity('tc')} = ${customerIdentity('oc')}
          AND account_revenuecat_customers.first_linked_at
            > own.first_linked_at)`
  ),
]

/** What `POST /accounts/v1/revenuecat-customers` accepts as `appUserId`. */
export const REVENUECAT_APP_USER_ID = /^[A-Za-z0-9_-]{8,64}$/

/**
 * RevenueCat's original id for the customer, kept even when anonymous
 * (`$RCAnonymousID:…`): it's what the customer's ids have in common. Null
 * when RevenueCat named none (or something no id is this long).
 */
const originalId = (status: SupporterStatus): string | null =>
  status.originalAppUserId && status.originalAppUserId.length <= 128
    ? status.originalAppUserId
    : null

/**
 * The app user ids a read says belong to the customer, matched as the
 * webhook matches them: the one asked about, the original, and the aliases.
 * Anonymous ids can't be linked, but they're kept here: the customer's
 * original id can be one, and a lock may hold it.
 */
const customerIds = (appUserId: string, status: SupporterStatus) =>
  [
    ...new Set(
      [appUserId, status.originalAppUserId, ...(status.aliases ?? [])].filter(
        (id): id is string => !!id && id.length <= 128
      )
    ),
  ].slice(0, 50)

/**
 * Captured at module evaluation, before Sentry's fetch integration wraps
 * `globalThis.fetch`, so the app user id in RevenueCat's URL stays out of
 * trace spans.
 */
const uninstrumentedFetch: typeof fetch = globalThis.fetch.bind(globalThis)

export interface SupporterDependencies {
  fetch: typeof fetch
  now: () => number
}

export const defaultSupporterDependencies: SupporterDependencies = {
  fetch: uninstrumentedFetch,
  now: () => Date.now(),
}

const deps = (
  overrides: Partial<SupporterDependencies> = {}
): SupporterDependencies => ({ ...defaultSupporterDependencies, ...overrides })

/** The account's status over every customer it links. */
export interface AccountSupporterStatus {
  supporter: boolean
  /** Epoch ms; null for no end, or when not a Supporter. */
  expiresAt: number | null
  /** How many customers the account links. */
  customers: number
}

interface CustomerRecord {
  appUserId: string
  supporter: boolean
  supporterExpiresAt: Date | null
  checkedAt: Date
}

const isActive = (record: CustomerRecord, now: number) =>
  record.supporter &&
  (record.supporterExpiresAt == null ||
    record.supporterExpiresAt.getTime() > now)

const combine = (
  records: CustomerRecord[],
  now: number
): AccountSupporterStatus => {
  const active = records.filter((record) => isActive(record, now))
  if (!active.length)
    return { supporter: false, expiresAt: null, customers: records.length }
  const ends = active.map((record) => record.supporterExpiresAt?.getTime())
  return {
    supporter: true,
    expiresAt: ends.some((end) => end == null)
      ? null
      : Math.max(...(ends as number[])),
    customers: records.length,
  }
}

/**
 * Upserts a customer's record from a RevenueCat read that started at
 * `startedAt`, unless a read that started later already wrote. An unknown
 * customer only updates an existing row (to not a Supporter); it's never
 * inserted.
 */
const storeRead = async (
  db: AccountsDb,
  appUserId: string,
  status: SupporterStatus,
  startedAt: number
): Promise<void> => {
  const values = {
    supporter: status.supporter,
    supporterExpiresAt:
      status.expiresAt == null ? null : new Date(status.expiresAt),
    checkedAt: new Date(startedAt),
  }
  if (!status.known) {
    // Not a customer any more: its ids say nothing, so the stored ones stay.
    await db
      .update(revenueCatCustomers)
      .set(values)
      .where(
        and(
          eq(revenueCatCustomers.appUserId, appUserId),
          lt(revenueCatCustomers.checkedAt, values.checkedAt)
        )
      )
    return
  }
  const known = { ...values, originalAppUserId: originalId(status) }
  await db
    .insert(revenueCatCustomers)
    .values({ appUserId, ...known })
    .onConflictDoUpdate({
      target: revenueCatCustomers.appUserId,
      set: known,
      setWhere: sql`${revenueCatCustomers.checkedAt} <= ${startedAt}`,
    })
}

/**
 * Reads one customer from RevenueCat and stores the answer. Throws
 * `RevenueCatError` when RevenueCat can't be read; nothing changes then.
 */
type SupporterEnv = Pick<Environment, 'REVENUECAT_API_KEY'> &
  Partial<
    Pick<
      Environment,
      | 'APP_ATTEST_ENVIRONMENT'
      | 'REVENUECAT_API_URL'
      | 'REVENUECAT_COUNT_WEB_SANDBOX'
    >
  >

/**
 * RevenueCat's origin: `REVENUECAT_API_URL` on a development worker (the
 * verify loop's fake), else the real one. Production ignores the override.
 */
const revenueCatOrigin = (env: SupporterEnv): string =>
  env.APP_ATTEST_ENVIRONMENT === 'development' && env.REVENUECAT_API_URL
    ? env.REVENUECAT_API_URL.replace(/\/$/, '')
    : REVENUECAT_API_ORIGIN

export const refreshCustomer = async (
  env: SupporterEnv,
  db: AccountsDb,
  appUserId: string,
  overrides: Partial<SupporterDependencies> = {}
): Promise<SupporterStatus> =>
  (await readCustomer(env, db, appUserId, overrides)).status

/** `refreshCustomer`, also answering when its read started. */
const readCustomer = async (
  env: SupporterEnv,
  db: AccountsDb,
  appUserId: string,
  overrides: Partial<SupporterDependencies> = {}
): Promise<{ status: SupporterStatus; startedAt: number }> => {
  const { fetch, now } = deps(overrides)
  const startedAt = now()
  const status = await fetchSupporterStatus({
    apiKey: env.REVENUECAT_API_KEY,
    appUserId,
    fetchImpl: fetch,
    nowMs: startedAt,
    apiOrigin: revenueCatOrigin(env),
    countWebSandbox: countsWebSandboxSubscriptions(env),
  })
  await storeRead(db, appUserId, status, startedAt)
  return { status, startedAt }
}

/** The account's linked customers' records. */
const linkedRecords = (db: AccountsDb, accountId: string) =>
  db
    .select({
      appUserId: revenueCatCustomers.appUserId,
      supporter: revenueCatCustomers.supporter,
      supporterExpiresAt: revenueCatCustomers.supporterExpiresAt,
      checkedAt: revenueCatCustomers.checkedAt,
    })
    .from(accountRevenueCatCustomers)
    .innerJoin(
      revenueCatCustomers,
      eq(revenueCatCustomers.appUserId, accountRevenueCatCustomers.appUserId)
    )
    .where(eq(accountRevenueCatCustomers.accountId, accountId))

/**
 * Links the customer to the account after reading it from RevenueCat, and
 * answers the account's status afterwards. A customer RevenueCat has never
 * seen isn't linked. Repeating a link moves its `linkedAt`, never its
 * `firstLinkedAt`; a link past either cap replaces the least recently
 * linked. Throws `RevenueCatError` when RevenueCat can't be read, and
 * `CustomerLockedError` when a key change locked the customer to another
 * account and this one doesn't still link it (ADR 0039 §9): checked on the
 * id asked about before reading, then on every id the read names, in the
 * link's own statement. Nothing changes then.
 */
export const linkCustomer = async (
  env: SupporterEnv,
  db: AccountsDb,
  accountId: string,
  appUserId: string,
  overrides: Partial<SupporterDependencies> = {}
): Promise<AccountSupporterStatus> => {
  const resolved = deps(overrides)
  const locked = await db
    .select({ id: revenueCatCustomerLocks.appUserId })
    .from(revenueCatCustomerLocks)
    .where(lockedElsewhere([appUserId], accountId, resolved.now()))
    .get()
  if (locked) throw new CustomerLockedError()
  const { status, startedAt } = await readCustomer(
    env,
    db,
    appUserId,
    resolved
  )
  const now = resolved.now()
  if (status.known) {
    const ids = customerIds(appUserId, status)
    const links = accountRevenueCatCustomers
    const keepNewest = (column: 'accountId' | 'appUserId', value: string) => {
      const other = column === 'accountId' ? links.appUserId : links.accountId
      const limit =
        column === 'accountId'
          ? SUPPORTER_LINK_LIMITS.customersPerAccount
          : SUPPORTER_LINK_LIMITS.accountsPerCustomer
      return db
        .delete(links)
        .where(
          and(
            eq(links[column], value),
            notInArray(
              other,
              db
                .select({ id: other })
                .from(links)
                .where(eq(links[column], value))
                .orderBy(desc(links.linkedAt), other)
                .limit(limit)
            )
          )
        )
    }
    const [, linked] = await db.batch([
      // The read above stored the customer; the hourly prune can delete it
      // again before this batch (nothing linked it yet), so put it back.
      db
        .insert(revenueCatCustomers)
        .values({
          appUserId,
          supporter: status.supporter,
          supporterExpiresAt:
            status.expiresAt == null ? null : new Date(status.expiresAt),
          checkedAt: new Date(startedAt),
          originalAppUserId: originalId(status),
        })
        .onConflictDoNothing(),
      // Columns: account_id, app_user_id, linked_at, first_linked_at; a
      // repeat moves only linked_at. Only while no key change locked any of
      // the customer's ids elsewhere.
      db.insert(links).select(
        sql`SELECT ${accountId}, ${appUserId}, ${now}, ${now}
          WHERE NOT ${lockedElsewhere(ids, accountId, now)}
          ON CONFLICT (account_id, app_user_id) DO UPDATE SET
            linked_at = excluded.linked_at`
      ),
      keepNewest('accountId', accountId),
      keepNewest('appUserId', appUserId),
    ])
    if (changes(linked) === 0) throw new CustomerLockedError()
  }
  return combine(await linkedRecords(db, accountId), now)
}

/**
 * Whether a record has to be read from RevenueCat again before it's an
 * answer: it's over `freshMs` old, or it was a Supporter whose end has passed
 * since it was read. A subscription renews at its end, and the webhook saying
 * so can come late or not at all; one read then tells a renewal from a lapse
 * (and is itself read after the end, so it's fresh until the next one).
 */
const needsRead = (record: CustomerRecord, now: number) => {
  const checkedAt = record.checkedAt.getTime()
  if (now - checkedAt >= SUPPORTER_LINK_LIMITS.freshMs) return true
  const end = record.supporterExpiresAt?.getTime()
  return record.supporter && end != null && end <= now && checkedAt < end
}

/**
 * The account's status: from records read within `freshMs`, else read from
 * RevenueCat again first (`needsRead`). An account with an active, fresh
 * record answers at once. The reads run together; one that finds a Supporter
 * is the answer even if another failed. Otherwise throws `RevenueCatError`
 * when any read failed: callers fail closed (route planning refuses, Notes
 * Import counts the User as free).
 */
export const accountSupporterStatus = async (
  env: SupporterEnv,
  db: AccountsDb,
  accountId: string,
  overrides: Partial<SupporterDependencies> = {}
): Promise<AccountSupporterStatus> => {
  const resolved = deps(overrides)
  const records = await linkedRecords(db, accountId)
  const now = resolved.now()
  const settled = records.filter((record) => !needsRead(record, now))
  if (settled.some((record) => isActive(record, now)))
    return { ...combine(settled, now), customers: records.length }
  const stale = records.filter((record) => needsRead(record, now))
  if (!stale.length) return combine(records, now)
  const reads = await Promise.allSettled(
    stale.map(async (record) => {
      const status = await refreshCustomer(env, db, record.appUserId, resolved)
      record.supporter = status.supporter
      record.supporterExpiresAt =
        status.expiresAt == null ? null : new Date(status.expiresAt)
      record.checkedAt = new Date(now)
    })
  )
  // A record whose read failed says nothing: it's left out of the answer.
  const failures = reads.filter(
    (read): read is PromiseRejectedResult => read.status === 'rejected'
  )
  const failed = stale.filter((_, i) => reads[i].status === 'rejected')
  const answer = combine(
    records.filter((record) => !failed.includes(record)),
    resolved.now()
  )
  if (answer.supporter || !failures.length)
    return { ...answer, customers: records.length }
  throw failures[0].reason
}

/**
 * Whether the session's account is a Supporter (ADR 0029): the one seam
 * every account-scoped Supporter check goes through. Notes Import asks it at
 * kickoff and when a run settles, route planning before each optimization.
 * Without the accounts database, no account is a Supporter. Rejects with
 * `RevenueCatError` as `accountSupporterStatus` does.
 */
export const isAccountSupporter = async (
  env: SupporterEnv & Pick<Environment, 'ACCOUNTS_DB'>,
  accountId: string,
  overrides: Partial<SupporterDependencies> = {}
): Promise<boolean> => {
  if (!env.ACCOUNTS_DB) return false
  return (
    await accountSupporterStatus(
      env,
      accountsDb(env.ACCOUNTS_DB),
      accountId,
      overrides
    )
  ).supporter
}

/** Of `appUserIds`, the ones some account links (the only ones worth a read). */
export const linkedCustomerIds = async (
  db: AccountsDb,
  appUserIds: string[]
): Promise<string[]> => {
  if (!appUserIds.length) return []
  const rows = await db
    .selectDistinct({ appUserId: accountRevenueCatCustomers.appUserId })
    .from(accountRevenueCatCustomers)
    .where(inArray(accountRevenueCatCustomers.appUserId, appUserIds))
  return rows.map((row) => row.appUserId)
}

/** True when the webhook already handled `eventId`. */
export const webhookEventSeen = async (
  db: AccountsDb,
  eventId: string
): Promise<boolean> =>
  (
    await db
      .select({ eventId: revenueCatWebhookEvents.eventId })
      .from(revenueCatWebhookEvents)
      .where(eq(revenueCatWebhookEvents.eventId, eventId))
      .limit(1)
  ).length > 0

/** Records `eventId` as handled; a repeat is a no-op. */
export const recordWebhookEvent = async (
  db: AccountsDb,
  eventId: string,
  now: number
): Promise<void> => {
  await db
    .insert(revenueCatWebhookEvents)
    .values({ eventId, receivedAt: new Date(now) })
    .onConflictDoNothing()
}

/**
 * Deletes webhook event ids past their 30 days, customers no account links
 * any more, and key change locks that ended. Run hourly by the cron.
 */
export const pruneSupporterRecords = async (
  db: AccountsDb,
  now: number = Date.now()
): Promise<void> => {
  await db.batch([
    db
      .delete(revenueCatWebhookEvents)
      .where(
        lt(
          revenueCatWebhookEvents.receivedAt,
          new Date(now - SUPPORTER_LINK_LIMITS.webhookEventRetentionMs)
        )
      ),
    db
      .delete(revenueCatCustomerLocks)
      .where(lte(revenueCatCustomerLocks.lockedUntil, new Date(now))),
    db
      .delete(revenueCatCustomers)
      .where(
        notInArray(
          revenueCatCustomers.appUserId,
          db
            .select({ appUserId: accountRevenueCatCustomers.appUserId })
            .from(accountRevenueCatCustomers)
        )
      ),
  ])
}
