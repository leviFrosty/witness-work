import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { bytesToBase64Url, sha256Bytes, timingSafeEqual } from '../crypto'
import {
  ACCOUNT_LIMITS,
  parseRefreshToken,
  type RefreshToken,
  type SessionCapability,
} from './contracts'
import {
  accountActivity,
  accountSessions,
  type SessionEndReason,
  type SessionMethod,
  type SessionPlatform,
} from './schema'
import { activityInsert, sessionIsLive } from './activity'
import { changes, type AccountsDb } from './store'
import type { RefreshKeys } from './tokens'

/**
 * Session rows in the accounts database (`account_sessions`). A session is
 * live until it's revoked or reaches `expiresAt`, 90 days after it opened.
 *
 * Refresh tokens are `<sessionId>.<secret>.<mac>` (opaque to the app), so a
 * token names its session even after it was replaced. Only the SHA-256 of a
 * whole token is stored: the current one, and the one it replaced, which
 * still works for a minute after the rotation so a lost response doesn't end
 * the session. Presenting it later, or any older token of a live session,
 * ends the session.
 *
 * The MAC (HMAC-SHA256 over `<sessionId>.<secret>` under `macKey`, from
 * `ACCOUNT_TOKEN_SECRET` in src/accounts/tokens.ts) proves this worker
 * issued the token. The session id is no secret (every access token carries
 * it), so without the MAC anyone could end a session by sending its id with
 * a made-up secret. A token whose MAC doesn't verify under the current or
 * previous secret is refused before the database is read, and never ends a
 * session.
 *
 * The token that replaces another is derived from it (HMAC under
 * `rotationKey`, another key from the secret), so every refresh presenting
 * the same token gets the same next one: a retry after a lost response, or
 * two refreshes at once from one device, never leave the device holding a
 * token the session no longer knows.
 *
 * Every way a live session ends, and every one that opens, is logged to the
 * account's activity in the same batch (ADR 0028); expiring isn't, and a
 * token that fails its MAC never reaches the log.
 */

const {
  sessionMs,
  webSessionMs,
  refreshGraceMs,
  sessionsPerAccount,
  webSessionsPerAccount,
  endedSessionRetentionMs,
} = ACCOUNT_LIMITS

export interface SessionRecord {
  id: string
  accountId: string
  platform: SessionPlatform
  /** The account's key epoch the session holds (its tokens' `kep`). */
  keyEpoch: number
  /**
   * The capabilities the session holds, for its tokens' `cap`; undefined
   * when this read doesn't know them (a renewal that carried the old
   * session's).
   */
  capabilities?: SessionCapability[]
  /** Epoch milliseconds. */
  expiresAt: number
}

/** A live session and the refresh token that now refreshes it. */
export interface IssuedSession {
  session: SessionRecord
  refreshToken: string
}

const randomBytes = (size: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(size))

const encoder = new TextEncoder()

/** b64u SHA-256 of the whole token's UTF-8. */
const refreshHash = async (token: string): Promise<string> =>
  bytesToBase64Url(await sha256Bytes(encoder.encode(token)))

const withHash = async (token: string) => ({
  token,
  hash: await refreshHash(token),
})

/** `body` (`<sessionId>.<secret>`) with its MAC under `keys`, and its hash. */
const issueRefreshToken = async (keys: RefreshKeys, body: string) => {
  const mac = await crypto.subtle.sign(
    'HMAC',
    keys.macKey,
    encoder.encode(body)
  )
  return withHash(`${body}.${bytesToBase64Url(new Uint8Array(mac))}`)
}

/**
 * Whether `presented` carries a MAC from one of `keys`. `subtle.verify`
 * compares in constant time.
 */
const isIssued = async (
  keys: readonly RefreshKeys[],
  presented: RefreshToken
): Promise<boolean> => {
  const body = encoder.encode(presented.body)
  for (const { macKey } of keys) {
    if (await crypto.subtle.verify('HMAC', macKey, presented.mac, body))
      return true
  }
  return false
}

/**
 * A session's first refresh token: a random secret, or for a browser's
 * session (`derived`) one derived from the session id under `rotationKey`,
 * so a lost-response repeat of its open can hand back the very same token
 * (`repeatSession`) without storing it.
 */
const firstRefreshToken = async (
  keys: RefreshKeys,
  sessionId: string,
  derived = false
) => {
  if (!derived)
    return issueRefreshToken(
      keys,
      `${sessionId}.${bytesToBase64Url(randomBytes(32))}`
    )
  const secret = await crypto.subtle.sign(
    'HMAC',
    keys.rotationKey,
    encoder.encode(`ww-account/v1/refresh-first\n${sessionId}`)
  )
  return issueRefreshToken(
    keys,
    `${sessionId}.${bytesToBase64Url(new Uint8Array(secret))}`
  )
}

/** The token that replaces `presented`, under one secret's `keys`. */
const nextRefreshToken = async (keys: RefreshKeys, presented: RefreshToken) => {
  const secret = await crypto.subtle.sign(
    'HMAC',
    keys.rotationKey,
    encoder.encode(`ww-account/v1/refresh-next\n${presented.token}`)
  )
  return issueRefreshToken(
    keys,
    `${presented.sessionId}.${bytesToBase64Url(new Uint8Array(secret))}`
  )
}


const sessionColumns = {
  id: accountSessions.id,
  accountId: accountSessions.accountId,
  platform: accountSessions.platform,
  keyEpoch: accountSessions.keyEpoch,
  refreshHash: accountSessions.refreshHash,
  previousRefreshHash: accountSessions.previousRefreshHash,
  expiresAt: accountSessions.expiresAt,
  revokedAt: accountSessions.revokedAt,
  rotatedAt: accountSessions.rotatedAt,
  endedReason: accountSessions.endedReason,
  capabilities: accountSessions.capabilities,
}

type SessionRow = {
  id: string
  accountId: string
  platform: SessionPlatform
  keyEpoch: number
  refreshHash: string
  previousRefreshHash: string | null
  expiresAt: Date
  revokedAt: Date | null
  rotatedAt: Date | null
  endedReason: SessionEndReason | null
  capabilities: SessionCapability[] | null
}

const isLive = (row: SessionRow, now: number): boolean =>
  row.revokedAt == null && row.expiresAt.getTime() > now

const record = (row: SessionRow): SessionRecord => ({
  id: row.id,
  accountId: row.accountId,
  platform: row.platform,
  keyEpoch: row.keyEpoch,
  capabilities: row.capabilities ?? [],
  expiresAt: row.expiresAt.getTime(),
})

/** What a new session needs besides its account. */
export interface NewSession {
  accountId: string
  /**
   * The account key it opens with, and the account's key epoch read with
   * it: the session opens only while they're still the account's, checked
   * in its insert, so a key a key change just retired never gets one.
   */
  accountPub: string
  keyEpoch: number
  platform: SessionPlatform
  device: string | null
  /** How it opened; `attestation` or `dev` for phones. */
  method: SessionMethod
  appVersion?: string | null
  capabilities?: SessionCapability[] | null
  /** `approval`: the phone's session that approved it (the entry's `actor`). */
  actorSessionId?: string | null
  /** `passkey`: the credential the sign-in asserted with. */
  stepUpCredentialId?: string | null
  /**
   * A renewal: the account's live session of the same platform this one
   * replaces (ended `renewed`). Logged as `session.renewed` with it as the
   * actor, in place of `session.opened`; the label, app version and
   * capabilities it leaves out are the old session's.
   */
  renews?: string | null
}

/**
 * The statements that open a session, for a batch of the caller's own (a
 * ticket's used id, web sign-up's account): the row, `session.opened`, and
 * the cap. Phones keep `sessionsPerAccount` live sessions and end the
 * oldest past it; browsers (`web`) keep `webSessionsPerAccount` of their own
 * and end the least recently active, each logged `session.replaced`. A web
 * session lasts `webSessionMs` from its last refresh and counts as stepped
 * up when it opens. `keys` are the current secret's.
 *
 * The row is written only while the account's key and epoch are still
 * `accountPub` and `keyEpoch`, and the other statements only once it was,
 * so nothing opens (`statements[0]` changes no row) after a key change
 * raced it.
 *
 * A renewal (`renews`) opens only while the session it renews is the
 * account's, live, and of the same platform, checked in the same insert, so
 * of two renewals of one session only the first opens. It ends that session
 * before the cap counts, so the account keeps as many sessions as before and
 * no other device's session is replaced.
 */
export const prepareSession = async (
  db: AccountsDb,
  keys: RefreshKeys,
  input: NewSession,
  now: number = Date.now()
) => {
  const id = bytesToBase64Url(randomBytes(16))
  const web = input.platform === 'web'
  const refresh = await firstRefreshToken(keys, id, web)
  const expiresAt = now + (web ? webSessionMs : sessionMs)
  // Every live session of the same kind but the newest `cap` (this one
  // among them). `LIMIT -1` is SQLite's "no limit", which Drizzle can't spell.
  const overflow = web
    ? sql`SELECT ${accountSessions.id} FROM ${accountSessions}
        WHERE ${accountSessions.accountId} = ${input.accountId}
          AND ${accountSessions.revokedAt} IS NULL
          AND ${accountSessions.expiresAt} > ${now}
          AND ${accountSessions.platform} = 'web'
        ORDER BY ${accountSessions.id} = ${id} DESC,
          COALESCE(${accountSessions.rotatedAt}, ${accountSessions.createdAt}) DESC,
          ${accountSessions.id} DESC
        LIMIT -1 OFFSET ${webSessionsPerAccount}`
    : sql`SELECT ${accountSessions.id} FROM ${accountSessions}
        WHERE ${accountSessions.accountId} = ${input.accountId}
          AND ${accountSessions.revokedAt} IS NULL
          AND ${accountSessions.expiresAt} > ${now}
          AND ${accountSessions.platform} != 'web'
        ORDER BY ${accountSessions.createdAt} DESC, ${accountSessions.id} DESC
        LIMIT -1 OFFSET ${sessionsPerAccount}`
  const opened = sql`EXISTS (SELECT 1 FROM ${accountSessions}
    WHERE ${accountSessions.id} = ${id})`
  const renews = input.renews ?? null
  // What a renewal leaves out, from the session it renews.
  const carried = (column: 'device' | 'app_version' | 'capabilities') =>
    renews == null
      ? sql`NULL`
      : sql`(SELECT ${sql.raw(column)} FROM account_sessions
          WHERE id = ${renews} AND account_id = ${input.accountId})`
  const device = sql`COALESCE(${input.device}, ${carried('device')})`
  const renewable =
    renews == null
      ? sql`1`
      : sql`EXISTS (SELECT 1 FROM account_sessions
          WHERE id = ${renews}
            AND account_id = ${input.accountId}
            AND platform = ${input.platform}
            AND revoked_at IS NULL
            AND expires_at > ${now})`
  // Columns in the table's order (see `activityInsert`).
  const insert = db.insert(accountSessions).select(
    sql`SELECT ${id}, ${input.accountId}, ${input.platform}, ${device},
        ${refresh.hash}, NULL, NULL, ${now}, ${expiresAt}, NULL,
        COALESCE(${input.appVersion ?? null}, ${carried('app_version')}),
        COALESCE(${input.capabilities ? JSON.stringify(input.capabilities) : null},
          ${carried('capabilities')}),
        ${input.method}, ${input.keyEpoch},
        ${web ? now : null}, ${input.stepUpCredentialId ?? null}, NULL
      WHERE EXISTS (SELECT 1 FROM accounts
          WHERE id = ${input.accountId}
            AND account_pub = ${input.accountPub}
            AND key_epoch = ${input.keyEpoch})
        AND ${renewable}`
  )
  const logged = activityInsert(
    db,
    renews == null
      ? {
          accountId: input.accountId,
          kind: 'session.opened',
          sessionId: id,
          actorSessionId: input.actorSessionId ?? null,
          method: input.method,
        }
      : {
          accountId: input.accountId,
          kind: 'session.renewed',
          sessionId: id,
          actorSessionId: renews,
          method: input.method,
        },
    { now, onlyIf: opened }
  )
  // A renewal ends the session it renews before the cap counts.
  const endRenewed =
    renews == null
      ? []
      : [
          db
            .update(accountSessions)
            .set({ revokedAt: new Date(now), endedReason: 'renewed' })
            .where(
              sql`${accountSessions.id} = ${renews}
                AND ${accountSessions.accountId} = ${input.accountId}
                AND ${accountSessions.revokedAt} IS NULL
                AND ${opened}`
            ),
        ]
  const statements = [
    insert,
    logged,
    ...endRenewed,
    // `session.replaced` for each session the cap is about to end, before
    // the update ends them. (Columns in the table's order; see
    // `activityInsert`.)
    db.insert(accountActivity).select(
      sql`SELECT NULL, account_id, 'session.replaced',
          id, platform, device, ${id}, ${input.platform}, ${device},
          NULL, ${now}, NULL, NULL
        FROM account_sessions WHERE id IN (${overflow}) AND ${opened}`
    ),
    db
      .update(accountSessions)
      .set({ revokedAt: new Date(now), endedReason: 'replaced' })
      .where(sql`${accountSessions.id} IN (${overflow}) AND ${opened}`),
  ] as const
  const issued: IssuedSession = {
    session: {
      id,
      accountId: input.accountId,
      platform: input.platform,
      keyEpoch: input.keyEpoch,
      // A renewal that sent none carries the old session's, unread here.
      ...(input.capabilities != null
        ? { capabilities: input.capabilities }
        : renews == null
          ? { capabilities: [] }
          : {}),
      expiresAt,
    },
    refreshToken: refresh.token,
  }
  return { statements, issued }
}

/**
 * Opens a session (`prepareSession`) in a batch of its own. Null when the
 * account's key changed first, or a renewal's session had already ended.
 */
export const createSession = async (
  db: AccountsDb,
  keys: RefreshKeys,
  input: NewSession,
  now: number = Date.now()
): Promise<IssuedSession | null> => {
  const { statements, issued } = await prepareSession(db, keys, input, now)
  const [inserted] = await db.batch(statements)
  return changes(inserted) === 1 ? issued : null
}

/**
 * The same live session again, for a ticket's open repeated after a lost
 * response, with no write: its first refresh token (derived, so the same
 * token the first answer carried), or, when that one was refreshed within
 * the last minute, the token it was replaced by, as a refresh within its
 * grace would answer. Either way the first answer's token keeps working as
 * it would for a phone, and never counts as reused. Null when the session
 * has ended or moved on since (`ticket_invalid`). `keys` are the current
 * secret's first, then the previous one's.
 */
export const repeatSession = async (
  db: AccountsDb,
  keys: readonly RefreshKeys[],
  input: { accountId: string; sessionId: string },
  now: number = Date.now()
): Promise<IssuedSession | null> => {
  const row = await findSession(db, input.sessionId)
  if (!row || row.accountId !== input.accountId || !isLive(row, now)) return null
  const inGrace =
    row.rotatedAt != null && now - row.rotatedAt.getTime() <= refreshGraceMs
  for (const secretKeys of keys) {
    const first = await firstRefreshToken(secretKeys, row.id, true)
    if (timingSafeEqual(first.hash, row.refreshHash))
      return { session: record(row), refreshToken: first.token }
    if (
      inGrace &&
      row.previousRefreshHash != null &&
      timingSafeEqual(first.hash, row.previousRefreshHash)
    ) {
      const presented = parseRefreshToken(first.token)!
      for (const rotationKeys of keys) {
        const next = await nextRefreshToken(rotationKeys, presented)
        if (timingSafeEqual(next.hash, row.refreshHash))
          return { session: record(row), refreshToken: next.token }
      }
    }
  }
  return null
}

const END_REASONS = {
  'session.signed_out': 'signed_out',
  'session.revoked': 'revoked',
  'session.refresh_reused': 'reused',
} as const satisfies Record<string, SessionEndReason>

/**
 * Ends a live session and logs why, in one batch. Nothing is logged for a
 * session that had already ended or expired. With `actorSessionId`, neither
 * happens unless that session is live too, checked in the same statements:
 * of two sessions revoking each other at once, only the first one wins.
 * Returns how many sessions it ended (0 or 1).
 */
const endSession = async (
  db: AccountsDb,
  {
    unrotated = false,
    ...ended
  }: {
    accountId: string
    sessionId: string
    kind: 'session.signed_out' | 'session.revoked' | 'session.refresh_reused'
    actorSessionId?: string
    /** Only while the session has never been refreshed. */
    unrotated?: boolean
  },
  now: number
): Promise<number> => {
  const conditions = [
    ended.actorSessionId == null
      ? undefined
      : sessionIsLive(ended.accountId, ended.actorSessionId, now),
    unrotated
      ? sql`NOT EXISTS (SELECT 1 FROM ${accountSessions}
          WHERE ${accountSessions.id} = ${ended.sessionId}
            AND ${accountSessions.rotatedAt} IS NOT NULL)`
      : undefined,
  ].filter((condition): condition is SQL => condition !== undefined)
  const [, update] = await db.batch([
    activityInsert(db, { ...ended, method: null }, {
      now,
      onlyIf: sql.join(
        [sessionIsLive(ended.accountId, ended.sessionId, now), ...conditions],
        sql` AND `
      ),
    }),
    db
      .update(accountSessions)
      .set({ revokedAt: new Date(now), endedReason: END_REASONS[ended.kind] })
      .where(
        and(
          eq(accountSessions.id, ended.sessionId),
          eq(accountSessions.accountId, ended.accountId),
          isNull(accountSessions.revokedAt),
          ...conditions
        )
      ),
  ])
  return changes(update)
}

/**
 * The session that renewed the account's `sessionId` (its `session.renewed`
 * entry's session), or null. The log, not the session rows, keeps the link, so
 * it outlives the old row by the log's 400 days.
 */
const renewedBy = async (
  db: AccountsDb,
  accountId: string,
  sessionId: string
): Promise<string | null> =>
  (
    await db
      .select({ sessionId: accountActivity.sessionId })
      .from(accountActivity)
      .where(
        and(
          eq(accountActivity.accountId, accountId),
          eq(accountActivity.kind, 'session.renewed'),
          eq(accountActivity.actorSessionId, sessionId)
        )
      )
      .orderBy(desc(accountActivity.id))
      .get()
  )?.sessionId ?? null

/** How many renewals a sign-out of an old id follows to the live session. */
const RENEWAL_HOPS = 8

/**
 * A renewed session's token came back: its device never kept the session
 * that renewed it (a lost answer, or killed before saving it). That successor
 * would stay live for 90 days with no holder, counting toward the cap, so it
 * ends (`session.signed_out`) while it has never been refreshed. One its
 * device has refreshed is left alone. The device opens a new session next.
 */
const endUnclaimedSuccessor = async (
  db: AccountsDb,
  row: SessionRow,
  now: number
): Promise<void> => {
  const successor = await renewedBy(db, row.accountId, row.id)
  if (successor == null) return
  await endSession(
    db,
    {
      accountId: row.accountId,
      sessionId: successor,
      kind: 'session.signed_out',
      unrotated: true,
    },
    now
  )
}

/**
 * Whether the account's session is live: not revoked, not expired, and not
 * deleted by the cron. One D1 read, never cached, so routes that check it
 * (`requireLiveSession`, src/accounts/auth.ts) see a revocation at once.
 */
export const isSessionLive = async (
  db: AccountsDb,
  accountId: string,
  sessionId: string,
  now: number = Date.now()
): Promise<boolean> =>
  (await liveSessionKeyEpoch(db, accountId, sessionId, now)) != null

/**
 * The key epoch of the account's session while it's live, else null: the
 * same one read as `isSessionLive`, so `requireLiveSession` also compares a
 * token's `kep` with it (ADR 0039).
 */
export const liveSessionKeyEpoch = async (
  db: AccountsDb,
  accountId: string,
  sessionId: string,
  now: number = Date.now()
): Promise<number | null> =>
  (
    await db
    .select({ keyEpoch: accountSessions.keyEpoch })
    .from(accountSessions)
    .where(
      and(
        eq(accountSessions.id, sessionId),
        eq(accountSessions.accountId, accountId),
        isNull(accountSessions.revokedAt),
        gt(accountSessions.expiresAt, new Date(now))
      )
    )
    .get()
  )?.keyEpoch ?? null

const findSession = async (
  db: AccountsDb,
  sessionId: string
): Promise<SessionRow | undefined> =>
  (await db
    .select(sessionColumns)
    .from(accountSessions)
    .where(eq(accountSessions.id, sessionId))
    .get()) as SessionRow | undefined

/**
 * Why a refresh was refused (401 `unauthorized`'s `reason`): another device
 * signed the session out (or it signed itself out), the cap ended it, it
 * expired, a replaced refresh token came back, the account key changed on
 * another session while it was live, the device renewed it into a new
 * session, or anything else.
 */
export const REFRESH_REFUSALS = [
  'revoked',
  'replaced',
  'expired',
  'reused',
  'key_changed',
  'renewed',
  'unknown',
] as const
export type RefreshRefusal = (typeof REFRESH_REFUSALS)[number]

export type RefreshOutcome =
  | { issued: IssuedSession }
  /** `changedAt` (epoch ms) with `key_changed`: when the key changed. */
  | { refused: RefreshRefusal; changedAt?: number }

/** What a refresh sent; each null leaves the stored one. */
export interface RefreshReport {
  appVersion: string | null
  capabilities: SessionCapability[] | null
}

/** What a refresh comes to, for one read of the session's row. */
type RefreshStep =
  | { done: RefreshOutcome }
  /** The row changed under this refresh: read it again. */
  | { changed: true }

const endedRefusal = (row: SessionRow, now: number): RefreshRefusal => {
  if (row.revokedAt == null)
    return row.expiresAt.getTime() <= now ? 'expired' : 'unknown'
  switch (row.endedReason) {
    case 'replaced':
      return 'replaced'
    case 'reused':
      return 'reused'
    case 'key_changed':
      return 'key_changed'
    case 'renewed':
      return 'renewed'
    default:
      return 'revoked'
  }
}

/**
 * Why the account's session isn't live (a refresh's `reason`: `revoked`,
 * `replaced`, `expired`, …), or null while it is. For a request that
 * started on a live session and found it ended partway (ADR 0039's key
 * change).
 */
export const sessionEndedReason = async (
  db: AccountsDb,
  accountId: string,
  sessionId: string,
  now: number = Date.now()
): Promise<RefreshRefusal | null> => {
  const row = await findSession(db, sessionId)
  if (!row || row.accountId !== accountId) return 'unknown'
  if (row.revokedAt == null && row.expiresAt.getTime() > now) return null
  return endedRefusal(row, now)
}

/**
 * One refresh of a token this worker issued, against the row as read: the
 * current token rotates (a compare-and-swap on the hash read, so only one
 * refresh can rotate it), the replaced one within its minute gets the token
 * it was replaced by again (no write), and any other token ends the session
 * unless `raced` (this refresh saw its token current a moment ago).
 */
const refreshStep = async (
  db: AccountsDb,
  keys: readonly RefreshKeys[],
  presented: RefreshToken,
  hash: string,
  row: SessionRow | undefined,
  now: number,
  raced: boolean,
  { appVersion, capabilities }: RefreshReport
): Promise<RefreshStep> => {
  if (!row) return { done: { refused: 'unknown' } }
  if (!isLive(row, now)) {
    const refused = endedRefusal(row, now)
    if (
      refused === 'renewed' &&
      (timingSafeEqual(hash, row.refreshHash) ||
        (row.previousRefreshHash != null &&
          timingSafeEqual(hash, row.previousRefreshHash)))
    )
      await endUnclaimedSuccessor(db, row, now)
    return {
      done:
        refused === 'key_changed' && row.revokedAt
          ? { refused, changedAt: row.revokedAt.getTime() }
          : { refused },
    }
  }

  if (timingSafeEqual(hash, row.refreshHash)) {
    const next = await nextRefreshToken(keys[0], presented)
    // A web session lasts 180 days from its last refresh.
    const expiresAt =
      row.platform === 'web' ? new Date(now + webSessionMs) : row.expiresAt
    const rotated = await db
      .update(accountSessions)
      .set({
        refreshHash: next.hash,
        previousRefreshHash: hash,
        rotatedAt: new Date(now),
        expiresAt,
        ...(appVersion != null ? { appVersion } : {}),
        ...(capabilities != null ? { capabilities } : {}),
      })
      .where(
        and(
          eq(accountSessions.id, row.id),
          eq(accountSessions.refreshHash, hash),
          isNull(accountSessions.revokedAt)
        )
      )
    return changes(rotated) === 1
      ? {
          done: {
            issued: {
              session: record({
                ...row,
                expiresAt,
                capabilities: capabilities ?? row.capabilities,
              }),
              refreshToken: next.token,
            },
          },
        }
      : { changed: true }
  }

  const replaced =
    row.previousRefreshHash != null &&
    timingSafeEqual(hash, row.previousRefreshHash)
  const inGrace =
    row.rotatedAt != null && now - row.rotatedAt.getTime() <= refreshGraceMs
  if (replaced && inGrace) {
    // The current token is this one's replacement, derived and signed under
    // the secret that rotated it: the current one, or the previous one just
    // after the secret rotated.
    for (const secretKeys of keys) {
      const next = await nextRefreshToken(secretKeys, presented)
      if (timingSafeEqual(next.hash, row.refreshHash))
        return {
          done: { issued: { session: record(row), refreshToken: next.token } },
        }
    }
    return { done: { refused: 'unknown' } }
  }

  // Issued by this worker, but replaced over a minute ago, or older still:
  // someone kept a copy. Logged as suspicious (`session.refresh_reused`).
  if (raced) return { done: { refused: 'unknown' } }
  await endSession(
    db,
    {
      accountId: row.accountId,
      sessionId: row.id,
      kind: 'session.refresh_reused',
    },
    now
  )
  // Tells a device that lost a refresh's answer (it presents the token just
  // replaced, however late) from a copy of an older one. No ids or tokens.
  console.info('accounts: refresh token reused', {
    predecessor: replaced,
    sinceRotationSec:
      row.rotatedAt == null
        ? null
        : Math.round((now - row.rotatedAt.getTime()) / 1000),
    platform: row.platform,
  })
  return { done: { refused: 'reused' } }
}

/**
 * Replaces the session's refresh token. Null means 401 `unauthorized`: a
 * token whose MAC doesn't verify (refused before any read, so it never ends
 * a session), an unknown session, an ended or expired one, or a token the
 * session replaced that isn't the one just replaced within its minute, which
 * also ends the session.
 *
 * Within that minute the replaced token gets the same new token it was
 * replaced by; the minute counts from the rotation, so retries can't stretch
 * it. A refresh whose rotation lost a race to another with the same token
 * reads the row once more and finds its token just replaced, so both answer
 * with the same token; if the session moved on again in between, it's 401
 * and the session lives, since that token was current a moment ago.
 * `keys` are the current secret's first, then the previous one's if set.
 * A refusal says why (`RefreshRefusal`). A web session's refresh also moves
 * its end to 180 days out; `appVersion` and `capabilities`, when sent,
 * replace the stored ones.
 */
export const refreshSession = async (
  db: AccountsDb,
  keys: readonly RefreshKeys[],
  presented: RefreshToken,
  now: number = Date.now(),
  report: RefreshReport = { appVersion: null, capabilities: null }
): Promise<RefreshOutcome> => {
  if (!(await isIssued(keys, presented))) return { refused: 'unknown' }
  const hash = await refreshHash(presented.token)
  for (const raced of [false, true]) {
    const row = await findSession(db, presented.sessionId)
    const step = await refreshStep(
      db,
      keys,
      presented,
      hash,
      row,
      now,
      raced,
      report
    )
    if ('done' in step) {
      if ('issued' in step.done && report.capabilities != null)
        forgetSessionCapabilities(presented.sessionId)
      return step.done
    }
  }
  return { refused: 'unknown' }
}

/** Ends the account's session; ending an ended one is a no-op. */
export const closeSession = async (
  db: AccountsDb,
  accountId: string,
  sessionId: string,
  now: number = Date.now()
): Promise<void> => {
  await endSession(db, { accountId, sessionId, kind: 'session.signed_out' }, now)
}

/**
 * What a revoke came to: done (or the session had already ended), no such
 * session on the account, or the calling session itself ended first.
 */
export type RevokeOutcome = 'revoked' | 'not_found' | 'caller_ended'

/**
 * Ends another of the account's sessions from the calling one
 * (`session.revoked`), or the caller's own (`session.signed_out`).
 * `not_found` when the account has no such session; an ended one is
 * `revoked` (idempotent). Another session is ended only while the caller's
 * own is live, in the same statements, so two devices revoking each other at
 * once can't both win: the loser gets `caller_ended` (401). A session a phone
 * renewed leads to the one that renewed it (`renewedBy`, up to `RENEWAL_HOPS`
 * renewals on): a device list read before the renewal names the old id, and
 * signing that out must sign the device out.
 */
export const revokeSession = async (
  db: AccountsDb,
  input: { accountId: string; sessionId: string; bySessionId: string },
  now: number = Date.now()
): Promise<RevokeOutcome> => {
  if (input.sessionId === input.bySessionId) {
    await closeSession(db, input.accountId, input.sessionId, now)
    return 'revoked'
  }
  const find = (sessionId: string) =>
    db
      .select({ endedReason: accountSessions.endedReason })
      .from(accountSessions)
      .where(
        and(
          eq(accountSessions.id, sessionId),
          eq(accountSessions.accountId, input.accountId)
        )
      )
      .get()
  let found = await find(input.sessionId)
  if (!found) return 'not_found'
  // A device list read before a renewal names the old id: sign out the
  // session that renewed it, the device's live one.
  let target = input.sessionId
  for (let hop = 0; hop < RENEWAL_HOPS && found?.endedReason === 'renewed'; hop++) {
    const next = await renewedBy(db, input.accountId, target)
    if (next == null) break
    target = next
    found = await find(target)
  }
  if (target === input.bySessionId) {
    await closeSession(db, input.accountId, target, now)
    return 'revoked'
  }
  const ended = await endSession(
    db,
    {
      accountId: input.accountId,
      sessionId: target,
      kind: 'session.revoked',
      actorSessionId: input.bySessionId,
    },
    now
  )
  if (ended > 0) return 'revoked'
  // Nothing ended: the session had already, or the caller's had.
  return (await isSessionLive(db, input.accountId, input.bySessionId, now))
    ? 'revoked'
    : 'caller_ended'
}

/**
 * The platform and liveness of each of the account's sessions in
 * `sessionIds` whose row still exists (ended rows are pruned in time).
 */
export const sessionStates = async (
  db: AccountsDb,
  accountId: string,
  sessionIds: string[],
  now: number = Date.now()
): Promise<Map<string, { platform: SessionPlatform; live: boolean }>> => {
  if (sessionIds.length === 0) return new Map()
  const rows = await db
    .select({
      id: accountSessions.id,
      platform: accountSessions.platform,
      revokedAt: accountSessions.revokedAt,
      expiresAt: accountSessions.expiresAt,
    })
    .from(accountSessions)
    .where(
      and(
        eq(accountSessions.accountId, accountId),
        inArray(accountSessions.id, sessionIds)
      )
    )
    .all()
  return new Map(
    rows.map((row) => [
      row.id,
      {
        platform: row.platform,
        live: row.revokedAt == null && row.expiresAt.getTime() > now,
      },
    ])
  )
}

/** A live session, as `GET /accounts/v1/sessions` lists it. */
export interface LiveSession {
  sessionId: string
  platform: SessionPlatform
  method: SessionMethod
  appVersion?: string
  /** The sealed device label, as the session sent it. */
  device?: string
  createdAt: number
  /** Its last refresh, or when it opened. */
  lastActiveAt: number
  expiresAt: number
}

/** The account's live sessions, newest first. */
export const listLiveSessions = async (
  db: AccountsDb,
  accountId: string,
  now: number = Date.now()
): Promise<LiveSession[]> => {
  const rows = await db
    .select({
      id: accountSessions.id,
      platform: accountSessions.platform,
      device: accountSessions.device,
      createdAt: accountSessions.createdAt,
      rotatedAt: accountSessions.rotatedAt,
      expiresAt: accountSessions.expiresAt,
      method: accountSessions.method,
      appVersion: accountSessions.appVersion,
    })
    .from(accountSessions)
    .where(
      and(
        eq(accountSessions.accountId, accountId),
        isNull(accountSessions.revokedAt),
        gt(accountSessions.expiresAt, new Date(now))
      )
    )
    .orderBy(desc(accountSessions.createdAt), desc(accountSessions.id))
    .all()
  return rows.map((row) => ({
    sessionId: row.id,
    platform: row.platform,
    // Sessions from before passkeys didn't record it; they attested (or
    // used the development bypass).
    method: row.method ?? (row.platform === 'dev' ? 'dev' : 'attestation'),
    ...(row.appVersion != null ? { appVersion: row.appVersion } : {}),
    ...(row.device != null ? { device: row.device } : {}),
    createdAt: row.createdAt.getTime(),
    lastActiveAt: (row.rotatedAt ?? row.createdAt).getTime(),
    expiresAt: row.expiresAt.getTime(),
  }))
}

/**
 * Deletes sessions that ended (revoked or expired) more than
 * `endedSessionRetentionMs` ago. Run hourly by the cron.
 */
export const pruneEndedSessions = async (
  db: AccountsDb,
  now: number = Date.now()
): Promise<number> => {
  const cutoff = new Date(now - endedSessionRetentionMs)
  return changes(
    await db
      .delete(accountSessions)
      .where(
        or(
          lte(accountSessions.expiresAt, cutoff),
          lte(accountSessions.revokedAt, cutoff)
        )
      )
  )
}

/** When the session last stepped up, or null; for the step-up check. */
export const sessionStepUpAt = async (
  db: AccountsDb,
  accountId: string,
  sessionId: string
): Promise<number | null> => {
  const row = await db
    .select({ stepUpAt: accountSessions.stepUpAt })
    .from(accountSessions)
    .where(
      and(
        eq(accountSessions.id, sessionId),
        eq(accountSessions.accountId, accountId)
      )
    )
    .get()
  return row?.stepUpAt?.getTime() ?? null
}

/** Records a step-up on a live session (a statement for the assertion's batch). */
export const stepUpUpdate = (
  db: AccountsDb,
  input: { accountId: string; sessionId: string; credentialId: string },
  now: number
) =>
  db
    .update(accountSessions)
    .set({ stepUpAt: new Date(now), stepUpCredentialId: input.credentialId })
    .where(
      and(
        eq(accountSessions.id, input.sessionId),
        eq(accountSessions.accountId, input.accountId),
        isNull(accountSessions.revokedAt)
      )
    )

const CAPABILITIES_CACHE_MS = 60_000
const CAPABILITIES_CACHE_ENTRIES = 1_000
const capabilitiesCache = new Map<
  string,
  { capabilities: SessionCapability[]; at: number }
>()

/** Clears the per-isolate session capabilities cache (tests). */
export const resetSessionCapabilitiesCache = (): void => capabilitiesCache.clear()

/** Drops one session's cached capabilities (a refresh sent new ones). */
export const forgetSessionCapabilities = (sessionId: string): void => {
  capabilitiesCache.delete(sessionId)
}

/**
 * The capabilities a session last sent (on open, or a refresh that sent
 * them); null when it sent none or doesn't exist. Only a session that has
 * some is cached, per isolate for 60 s, so an app that adds them on refresh
 * is answered at once. Another isolate may still answer a dropped list for
 * up to 60 s. Throws when the database can't be read.
 */
export const cachedSessionCapabilities = async (
  db: AccountsDb,
  sessionId: string
): Promise<SessionCapability[] | null> => {
  const now = Date.now()
  const cached = capabilitiesCache.get(sessionId)
  if (cached && now - cached.at < CAPABILITIES_CACHE_MS) return cached.capabilities
  const row = await db
    .select({ capabilities: accountSessions.capabilities })
    .from(accountSessions)
    .where(eq(accountSessions.id, sessionId))
    .get()
  const capabilities = row?.capabilities ?? null
  capabilitiesCache.delete(sessionId)
  if (capabilities?.length) {
    if (capabilitiesCache.size >= CAPABILITIES_CACHE_ENTRIES)
      capabilitiesCache.delete(capabilitiesCache.keys().next().value!)
    capabilitiesCache.set(sessionId, { capabilities, at: now })
  }
  return capabilities
}
