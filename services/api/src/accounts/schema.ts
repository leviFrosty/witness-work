import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import type { SessionCapability } from './contracts'

/**
 * The accounts database (D1 `ACCOUNTS_DB`). It knows each account by a random
 * id and the public half of its signing key, and which Buddies inboxes it owns
 * (Option A in witness-work ADR 0024). No name, email, or phone number, and no
 * private key: the account key never leaves the User's devices.
 */

export const ACCOUNT_STATUSES = ['active', 'suspended'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

/** Why a status changed. A short code, never free text about the User. */
export const ACCOUNT_STATUS_REASONS = [
  'report',
  'automated',
  'appeal',
  'admin',
] as const
export type AccountStatusReason = (typeof ACCOUNT_STATUS_REASONS)[number]

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())

/** Where an account was created: by a phone opening a session, or on the web. */
export const ACCOUNT_ORIGINS = ['app', 'web'] as const
export type AccountOrigin = (typeof ACCOUNT_ORIGINS)[number]

export const accounts = sqliteTable('accounts', {
  /** b64u of 16 random bytes, minted here. An identifier, not a secret. */
  id: text('id').primaryKey(),
  /** The account signing key's Ed25519 public key (b64u, 32 bytes). */
  accountPub: text('account_pub').notNull().unique(),
  status: text('status', { enum: ACCOUNT_STATUSES })
    .notNull()
    .default('active'),
  createdAt: createdAt(),
  /**
   * The passkey user handle (`user.id`, witness-work ADR 0038): b64u of 32
   * random bytes, minted the first time the account needs one, never changed.
   * Random; names no one.
   */
  passkeyUserHandle: text('passkey_user_handle').unique(),
  /**
   * Raised when the account key changes (ADR 0039). Passkey wraps and
   * sessions record the epoch they were made under.
   */
  keyEpoch: integer('key_epoch').notNull().default(0),
  createdVia: text('created_via', { enum: ACCOUNT_ORIGINS })
    .notNull()
    .default('app'),
  /** When the account key last changed (ADR 0039); null if it never has. */
  keyChangedAt: integer('key_changed_at', { mode: 'timestamp_ms' }),
})

/**
 * Account keys a key change replaced (ADR 0039), retired for good: opening a
 * session, registering, or signing up with one is `key_retired`, and none
 * ever creates an account. Public keys only, as pseudonymous as
 * `accounts.account_pub`. No foreign key, so a key stays retired whatever
 * becomes of its account.
 */
export const retiredAccountKeys = sqliteTable(
  'retired_account_keys',
  {
    /** The retired signing key's Ed25519 public key (b64u, 32 bytes). */
    accountPub: text('account_pub').primaryKey(),
    accountId: text('account_id').notNull(),
    /** The account's key epoch while this key was its key. */
    keyEpoch: integer('key_epoch').notNull(),
    retiredAt: integer('retired_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('retired_account_keys_account_idx').on(t.accountId)]
)

/**
 * The key history blob the last key change stored (ADR 0039 §6): sealed by
 * the devices under a key from the current account key, stored opaque and
 * never read here.
 */
export const accountKeyHistory = sqliteTable('account_key_history', {
  accountId: text('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  /** The epoch it was sealed for (its AAD names it). */
  keyEpoch: integer('key_epoch').notNull(),
  blob: text('blob').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

/** Every status change, for appeals and auditing. */
export const accountStatusEvents = sqliteTable(
  'account_status_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ACCOUNT_STATUSES }).notNull(),
    reason: text('reason', { enum: ACCOUNT_STATUS_REASONS }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('account_status_events_account_idx').on(t.accountId)]
)

export const SESSION_PLATFORMS = ['ios', 'android', 'dev', 'web'] as const
export type SessionPlatform = (typeof SESSION_PLATFORMS)[number]

/**
 * How a session opened: an attested phone, the development bypass, or a
 * browser with a ticket from a passkey, a phone's approval, a recovery key,
 * or web sign-up (witness-work `docs/passkeys-protocol.md`).
 */
export const SESSION_METHODS = [
  'attestation',
  'dev',
  'passkey',
  'approval',
  'recovery',
  'signup',
] as const
export type SessionMethod = (typeof SESSION_METHODS)[number]

/** Why a session ended, for a refused refresh's `reason`. */
export const SESSION_END_REASONS = [
  'signed_out',
  'revoked',
  'replaced',
  'reused',
  // Ended by an account key change on another session (witness-work ADR
  // 0039); only sessions still live at the change.
  'key_changed',
  // Replaced by the session that renewed it (`session.renewed`).
  'renewed',
] as const
export type SessionEndReason = (typeof SESSION_END_REASONS)[number]

/**
 * Attested sessions (witness-work ADR 0027): one row per session opened
 * (`POST /accounts/v1/sessions`). Only the account, the platform, the sealed
 * device label, the SHA-256 of the current and previous refresh token, and
 * times. Never the install, its App Attest key, `accountPub`, or an IP.
 */
export const accountSessions = sqliteTable(
  'account_sessions',
  {
    /** b64u of 16 random bytes; the access token's `sid`. */
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** What attested the session; `dev` is the development bypass. */
    platform: text('platform', { enum: SESSION_PLATFORMS }).notNull(),
    /** The device label, sealed under a key only the account's devices hold. */
    device: text('device'),
    /** b64u SHA-256 of the current refresh token's bytes. */
    refreshHash: text('refresh_hash').notNull().unique(),
    /** The one it replaced, accepted for a minute after `rotatedAt`. */
    previousRefreshHash: text('previous_refresh_hash'),
    rotatedAt: integer('rotated_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    /**
     * Phones: 90 days after it opened; refreshing never moves it. Web: 180
     * days after its last refresh (sliding, no absolute limit).
     */
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    /** The app version it last opened or refreshed with (`major.minor.patch`). */
    appVersion: text('app_version'),
    /**
     * What the app said it does, on open or its latest refresh that sent
     * them (`SESSION_CAPABILITIES`); null when it never sent any.
     */
    capabilities: text('capabilities', { mode: 'json' }).$type<SessionCapability[]>(),
    /** How it opened; null for sessions from before passkeys. */
    method: text('method', { enum: SESSION_METHODS }),
    /** The account's key epoch when it opened. */
    keyEpoch: integer('key_epoch').notNull().default(0),
    /** Its last server-checked step-up (web), or when a web session opened. */
    stepUpAt: integer('step_up_at', { mode: 'timestamp_ms' }),
    /** The passkey that step-up asserted with, when one did. */
    stepUpCredentialId: text('step_up_credential_id'),
    /** Why it ended, once revoked. */
    endedReason: text('ended_reason', { enum: SESSION_END_REASONS }),
  },
  (t) => [
    index('account_sessions_account_idx').on(t.accountId),
    index('account_sessions_previous_refresh_idx').on(t.previousRefreshHash),
  ]
)

/**
 * The account's security history (witness-work ADR 0028), newest by `id`.
 * Written only by the server, in the same batch as the action where it can
 * be (`src/accounts/activity.ts`). Never an IP, location, user agent, or
 * content; device names stay in their sealed labels. Kept 400 days.
 */
export const ACTIVITY_KINDS = [
  'account.created',
  'session.opened',
  // A phone's live session replaced by a new one it opened with the same
  // proof (the session is the new one, the actor the one it ended).
  'session.renewed',
  'session.signed_out',
  'session.revoked',
  'session.replaced',
  'session.refresh_reused',
  'handoff.sent',
  'backup.deleted',
  'backup.downloaded',
  'account.suspended',
  'account.reinstated',
  'buddies.inbox_linked',
  'buddies.deleted',
  'passkey.added',
  'passkey.removed',
  'device.approved',
  'account.key_changed',
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export const accountActivity = sqliteTable(
  'account_activity',
  {
    /** Increasing; the list's cursor. */
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ACTIVITY_KINDS }).notNull(),
    /** The session the entry is about, or that did it. */
    sessionId: text('session_id'),
    sessionPlatform: text('session_platform', { enum: SESSION_PLATFORMS }),
    /** That session's sealed device label, copied so it outlives the row. */
    sessionDevice: text('session_device'),
    /**
     * The session that ended `sessionId` (`session.revoked`, `.replaced`), or
     * the one `sessionId` renewed (`session.renewed`).
     */
    actorSessionId: text('actor_session_id'),
    actorPlatform: text('actor_platform', { enum: SESSION_PLATFORMS }),
    actorDevice: text('actor_device'),
    /** The backup slot (`backup.*`); null for "every slot". */
    slotId: text('slot_id'),
    createdAt: createdAt(),
    /** `session.opened` and `.renewed`: how the session opened. */
    method: text('method', { enum: SESSION_METHODS }),
    /** `passkey.*`: the credential. */
    credentialId: text('credential_id'),
  },
  (t) => [
    index('account_activity_account_idx').on(t.accountId, t.id),
    index('account_activity_created_idx').on(t.createdAt),
  ]
)

/**
 * Which account owns each Buddies inbox. Written only after the inbox accepted
 * a registration signed by its owner key that also carried the account key's
 * signature over the same inbox, so neither key alone can link an inbox.
 */
export const accountInboxes = sqliteTable(
  'account_inboxes',
  {
    inboxId: text('inbox_id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    /**
     * The account's key epoch (ADR 0039) whose key signed the link's proof,
     * when it was made or last confirmed by a registration whose proof the
     * current key signed. Only a link at the account's current epoch can be
     * an inbox's successor.
     */
    keyEpoch: integer('key_epoch').notNull().default(0),
    /**
     * The account's key epoch when the inbox was first linked; never moves.
     * The inbox's owner key is that epoch's (it comes from the account key),
     * so once the account's key has changed past it, the relay refuses the
     * inbox's owner-signed requests for good (`key_changed`).
     */
    firstKeyEpoch: integer('first_key_epoch').notNull().default(0),
  },
  (t) => [index('account_inboxes_account_idx').on(t.accountId)]
)

/**
 * The inbox that replaced a deleted one after a key change (ADR 0039 §5),
 * recorded by `inbox/delete` with `successor`, so a buddy can check a
 * reconnect invite the old key's pairing carried. Kept 90 days.
 */
export const inboxSuccessors = sqliteTable(
  'inbox_successors',
  {
    /** The deleted inbox. */
    inboxId: text('inbox_id').primaryKey(),
    successorId: text('successor_id').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('inbox_successors_account_idx').on(t.accountId),
    index('inbox_successors_recorded_idx').on(t.recordedAt),
  ]
)

/**
 * The RevenueCat customers accounts link (witness-work ADR 0029), with what
 * RevenueCat's REST API last said about each. Never written from a client's
 * say-so: every row is a read of RevenueCat. A customer nobody links isn't
 * stored. `appUserId` is ADR 0011's shared id (or an install id), which
 * RevenueCat's SDK treats as the customer's capability: never log it.
 */
export const revenueCatCustomers = sqliteTable('revenuecat_customers', {
  appUserId: text('app_user_id').primaryKey(),
  /** ADR 0014's rule, as of `checkedAt`. */
  supporter: integer('supporter', { mode: 'boolean' }).notNull(),
  /** When Supporter status ends; null for no end, or when not a Supporter. */
  supporterExpiresAt: integer('supporter_expires_at', { mode: 'timestamp_ms' }),
  /**
   * When the read stored here started. A write lands only over an older one,
   * so concurrent webhook reads can't leave the stale answer behind.
   */
  checkedAt: integer('checked_at', { mode: 'timestamp_ms' }).notNull(),
  /**
   * RevenueCat's `original_app_user_id` for the customer, as of `checkedAt`
   * (null when it named none). Every app user id of one customer shares it,
   * so a key change's lock and unlink (ADR 0039 §9) match the customer by
   * `COALESCE(original_app_user_id, app_user_id)`, not by the id linked.
   */
  originalAppUserId: text('original_app_user_id'),
})

/**
 * Which accounts link which customers. An account is a Supporter when any
 * customer it links is. Each side keeps at most `SUPPORTER_LINK_LIMITS`
 * links; a new one past that replaces the least recently linked.
 */
export const accountRevenueCatCustomers = sqliteTable(
  'account_revenuecat_customers',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    appUserId: text('app_user_id')
      .notNull()
      .references(() => revenueCatCustomers.appUserId, { onDelete: 'cascade' }),
    /** The last time an app linked it; every repeat moves it. */
    linkedAt: integer('linked_at', { mode: 'timestamp_ms' }).notNull(),
    /**
     * When the account first linked it; never moves while the link lasts. A
     * key change unlinks the customer only from accounts that linked it later
     * than the changing account did (ADR 0039 §9).
     */
    firstLinkedAt: integer('first_linked_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`0`),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.appUserId] }),
    index('account_revenuecat_customers_customer_idx').on(t.appUserId),
  ]
)

/**
 * RevenueCat customers a key change locked to their account (witness-work
 * ADR 0039 §9): the old key's sync data reveals the account's app user ids,
 * so until `lockedUntil` no other account may link them. Pruned once ended.
 */
export const revenueCatCustomerLocks = sqliteTable(
  'revenuecat_customer_locks',
  {
    appUserId: text('app_user_id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('revenuecat_customer_locks_until_idx').on(t.lockedUntil)]
)

/** RevenueCat webhook event ids already handled, kept 30 days. Ids only. */
export const revenueCatWebhookEvents = sqliteTable(
  'revenuecat_webhook_events',
  {
    eventId: text('event_id').primaryKey(),
    receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('revenuecat_webhook_events_received_idx').on(t.receivedAt)]
)

/** The platform a passkey was created from (the session's). */
export const PASSKEY_PLATFORMS = SESSION_PLATFORMS

/**
 * Passkeys (witness-work ADR 0038, `docs/passkeys-protocol.md`): WebAuthn
 * credentials of an account, never an identity of their own. The public key
 * and what the authenticator last reported; never a PRF output, which the
 * server never sees.
 */
export const passkeys = sqliteTable(
  'passkeys',
  {
    /** b64u of the credential id (`rawId`). */
    credentialId: text('credential_id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** b64u of the COSE public key. */
    publicKey: text('public_key').notNull(),
    /** The latest sign counter; synced passkeys stay at 0. */
    counter: integer('counter').notNull().default(0),
    /** JSON array of transports, as registration reported them. */
    transports: text('transports'),
    /** BE: `singleDevice` or `multiDevice`, as of the latest ceremony. */
    deviceType: text('device_type', {
      enum: ['singleDevice', 'multiDevice'],
    }).notNull(),
    /** BS, as of the latest ceremony. */
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    /** For a provider name only. */
    aaguid: text('aaguid'),
    /** The RP ID it was created for. */
    rpId: text('rp_id').notNull(),
    createdPlatform: text('created_platform', {
      enum: PASSKEY_PLATFORMS,
    }).notNull(),
    /** The creating device's label, sealed like a session's. */
    label: text('label'),
    createdAt: createdAt(),
    /** Its last verified assertion. */
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('passkeys_account_idx').on(t.accountId, t.createdAt)]
)

/**
 * The account key sealed under a key derived from a passkey's PRF output
 * (a wrap). Ciphertext only; up to four per credential, since a synced
 * passkey can answer differently on different devices. ADR 0039 deletes an
 * account's wraps when its key changes.
 */
export const passkeyWraps = sqliteTable(
  'passkey_wraps',
  {
    /**
     * b64u of 16 random bytes the device made for this wrap; unique per
     * credential only, so another account's id never conflicts or shows.
     */
    wrapId: text('wrap_id').notNull(),
    credentialId: text('credential_id')
      .notNull()
      .references(() => passkeys.credentialId, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** The account's key epoch the wrap was made under. */
    keyEpoch: integer('key_epoch').notNull(),
    /** b64u(0x01 ‖ nonce ‖ XChaCha20-Poly1305), 98 characters. */
    wrap: text('wrap').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.credentialId, t.wrapId] }),
    index('passkey_wraps_credential_idx').on(t.credentialId, t.createdAt),
    index('passkey_wraps_account_idx').on(t.accountId),
  ]
)

/**
 * Ids of challenges and tickets already used (`docs/passkeys-protocol.md`,
 * "Challenges and tickets"): both are stateless MACs, so this is what makes
 * each work once. Written in the same batch as what it authorized; pruned
 * once expired. A ticket that opened a session names it, with a hash of the
 * signed request, so the same request again (a lost response) gets that
 * session back.
 */
export const usedTokenIds = sqliteTable(
  'used_token_ids',
  {
    /** b64u of the token's 16-byte id. */
    id: text('id').primaryKey(),
    /** When the token itself expires. */
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    /** The session a ticket opened. */
    sessionId: text('session_id'),
    /** b64u SHA-256 of the request that used it. */
    requestHash: text('request_hash'),
  },
  (t) => [index('used_token_ids_expires_idx').on(t.expiresAt)]
)
