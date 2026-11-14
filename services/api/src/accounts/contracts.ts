import { bytesToBase64Url, sha256Hex } from '../crypto'
import {
  BUDDIES_ID_PATTERN,
  decodeB64u,
  isPlainObject,
} from '../buddies/contracts'

/**
 * The accounts wire contract (witness-work `docs/accounts-protocol.md`). An
 * account is a random `accountId` the server mints and the public key of the
 * account signing key, which every device derives from the User's account key.
 *
 * Requests use the Buddies envelope
 * `{ "payload": b64u(JSON), "signature": b64u(Ed25519) }` under their own signing context, so no account signature can pass for a
 * Buddies one or the other way round.
 */

/** Ops signed by the account key (the old phone's, for handoff). */
export const ACCOUNTS_OPS = [
  'account/register',
  'account/info',
  'handoff/open',
  'handoff/status',
  'handoff/send',
  'handoff/cancel',
  'backup/put',
  'backup/list',
  'backup/get',
  'backup/delete',
  'session/open',
  'sync/request',
  'passkey/add',
  'passkey/wrap',
  'passkey/remove',
  'web/signup',
  'web/recovery',
  'account/rekey',
] as const
export type AccountsOp = (typeof ACCOUNTS_OPS)[number]

/** `backup/put` sends its signed envelope in these headers; the body is the blob. */
export const ACCOUNT_ENVELOPE_HEADERS = {
  payload: 'x-ww-payload',
  signature: 'x-ww-signature',
} as const
/** The short header names older app builds send; still accepted. */
export const LEGACY_ACCOUNT_ENVELOPE_HEADERS = {
  payload: 'x-ww-p',
  signature: 'x-ww-s',
} as const

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const MIB = 1_024 * 1_024

/** Handoff and backup limits from the contract's "Handoff" and "Backup". */
export const ACCOUNT_LIMITS = {
  /** A handoff channel lives this long from `handoff/open`. */
  handoffLifetimeMs: 10 * MINUTE_MS,
  /** Wrong `claimToken`s before the channel is burned (`cancelled`). */
  handoffBadTokens: 5,
  /** `handoff/open` per account per rolling day. */
  handoffOpensPerDay: 20,
  handoffOpenWindowMs: DAY_MS,
  /** The sealed hello, b64u characters. */
  handoffHelloChars: 2 * 1_024,
  /** The sealed account key, b64u characters. */
  handoffKeyChars: 1_024,
  /** One backup blob. */
  backupBytes: 20 * MIB,
  /** Backup slots per account. */
  backupSlots: 8,
  /** One `backup/put` per slot this often. */
  backupPutIntervalMs: MINUTE_MS,
  /** An access token lives this long. */
  accessTokenMs: 15 * MINUTE_MS,
  /** A session lives this long from opening; refreshing never extends it. */
  sessionMs: 90 * DAY_MS,
  /** The refresh token just replaced still works this long (a lost response). */
  refreshGraceMs: MINUTE_MS,
  /** Live sessions per account; opening another ends the oldest. */
  sessionsPerAccount: 10,
  /** Sessions opened per account key per rolling day. */
  sessionOpensPerDay: 20,
  /** A web session lasts this long from its last refresh (sliding). */
  webSessionMs: 180 * DAY_MS,
  /** Live web sessions per account, apart from the phones' cap. */
  webSessionsPerAccount: 3,
  /** A web session's step-up counts this long. */
  stepUpMs: 5 * MINUTE_MS,
  /** `appVersion`, characters. */
  appVersionChars: 32,
  /** `capabilities`: entries, and characters each. */
  capabilities: 16,
  capabilityChars: 32,
  /** Passkeys per account (`limit`). */
  passkeysPerAccount: 10,
  /** Wraps kept per credential; a fifth replaces the oldest. */
  wrapsPerCredential: 4,
  /** A passkey's sealed label, b64u characters. */
  passkeyLabelChars: 512,
  /** A serialized WebAuthn response, characters (`too_large`). */
  passkeyResponseChars: 16 * 1_024,
  /** A Turnstile token, characters (Cloudflare's cap); longer is `bad_request`. */
  turnstileTokenChars: 2_048,
  /** The sealed device label, b64u characters. */
  sessionDeviceChars: 512,
  /** An approval channel lives this long from `approval/open` until claimed. */
  approvalOpenMs: 75 * 1_000,
  /** And this long from the claim. */
  approvalClaimedMs: 5 * MINUTE_MS,
  /** Wrong `claimToken`s or `browserToken`s before the channel is burned. */
  approvalBadTokens: 5,
  /** `approval/open` per caller IP per rolling hour. */
  approvalOpensPerHour: 60,
  /** The sealed hello and key, b64u characters. */
  approvalHelloChars: 1_024,
  approvalKeyChars: 1_024,
  /** `far`: farther than this, by haversine, between the two requests. */
  approvalFarKm: 200,
  /** Ended sessions (revoked or expired) are deleted after this long. */
  endedSessionRetentionMs: 7 * DAY_MS,
  /** A key change's sealed key history, characters (`too_large`). */
  keyHistoryChars: 64 * 1_024,
  /** A web session this young can't change the account key (`session_too_new`). */
  keyChangeSessionAgeMs: DAY_MS,
  /** Key changes per account a rolling day, and a rolling 30 days. */
  keyChangesPerDay: 3,
  keyChangesPer30Days: 10,
} as const

/** A slot's R2 object key; `v1/<accountId>/` lists an account's slots. */
export const backupObjectKey = (accountId: string, slotId: string): string =>
  `${backupPrefix(accountId)}${slotId}`

export const backupPrefix = (accountId: string): string => `v1/${accountId}/`

const SIGNING_CONTEXT = 'ww-account/v1\n'
const encoder = new TextEncoder()

const concat = (prefix: Uint8Array, rest: Uint8Array): Uint8Array => {
  const message = new Uint8Array(prefix.byteLength + rest.byteLength)
  message.set(prefix, 0)
  message.set(rest, prefix.byteLength)
  return message
}

/**
 * What the new key signs on `account/rekey` (`newSignature`): the same
 * payload under its own op line, so neither signature passes for the other.
 */
export const REKEY_NEW_KEY_OP = 'account/rekey/new'

/** The bytes `newSignature` covers. */
export const rekeyNewKeyMessage = (payloadBytes: Uint8Array): Uint8Array =>
  concat(encoder.encode(`${SIGNING_CONTEXT}${REKEY_NEW_KEY_OP}\n`), payloadBytes)

/** The bytes an account op's signature covers: context, op, then `payload` decoded. */
export const accountSignedMessage = (
  op: AccountsOp,
  payloadBytes: Uint8Array
): Uint8Array =>
  concat(encoder.encode(`${SIGNING_CONTEXT}${op}\n`), payloadBytes)

/**
 * What the account signing key signs to claim an inbox. `inbox/register`
 * carries it, inside a payload the inbox's owner key signs, so the link takes
 * both keys.
 */
export const inboxLinkMessage = (
  accountId: string,
  inboxId: string,
  ownerPub: string
): Uint8Array =>
  encoder.encode(
    `${SIGNING_CONTEXT}inbox/link\n${accountId}\n${inboxId}\n${ownerPub}`
  )

/** `account/register` and `account/info` both name the signing key. */
export interface AccountKeyPayload {
  accountPub: string
  ts: number
  nonce: string
}

export const isAccountId = (value: unknown): value is string =>
  typeof value === 'string' && BUDDIES_ID_PATTERN.test(value)

/** Canonical b64u of exactly `size` bytes, or null. */
const canonicalBytes = (value: unknown, size: number): string | null => {
  if (typeof value !== 'string') return null
  const bytes = decodeB64u(value)
  return bytes && bytes.length === size ? bytesToBase64Url(bytes) : null
}

/** Canonical b64u of exactly 32 bytes, or null. */
const publicKey = (value: unknown): string | null => canonicalBytes(value, 32)

/** A 16-byte id (channel, slot, claim token) in its one canonical spelling. */
const id16 = (value: unknown): string | null => {
  const canonical = canonicalBytes(value, 16)
  return canonical != null && canonical === value ? canonical : null
}

/** A sealed blob as b64u: decodable, non-empty, at most `maxChars`. */
const sealed = (value: unknown, maxChars: number): string | null => {
  if (typeof value !== 'string' || value.length === 0) return null
  if (value.length > maxChars) return null
  return decodeB64u(value) ? value : null
}

/**
 * Validates `account/register`'s or `account/info`'s payload; null means
 * `bad_request`.
 */
export const parseAccountKeyPayload = (
  payload: unknown
): AccountKeyPayload | null => {
  if (!isPlainObject(payload)) return null
  const accountPub = publicKey(payload.accountPub)
  const ts = payload.ts
  if (!accountPub) return null
  if (typeof ts !== 'number' || !Number.isSafeInteger(Math.floor(ts)))
    return null
  if (!isAccountId(payload.nonce)) return null
  return { accountPub, ts: Math.floor(ts), nonce: payload.nonce }
}

// --- Handoff and backup payloads -------------------------------------------

export interface HandoffOpenFields {
  channelId: string
  /** b64u SHA-256 of the claim token, 32 bytes. */
  verifier: string
}

export interface HandoffChannelFields {
  channelId: string
}

export interface HandoffSendFields {
  channelId: string
  key: string
}

export interface BackupPutFields {
  slotId: string
  size: number
  sha256: string
}

export interface BackupSlotFields {
  slotId: string
}

export interface BackupDeleteFields {
  slotId: string | null
}

export interface SessionOpenFields {
  /**
   * The answer to a `POST /attestation/v1/challenge` challenge for purpose
   * `account-session`; checked by `src/accounts/attestation.ts`. Null only
   * when the request leaves it out (the development bypass).
   */
  attestation: Record<string, unknown> | null
  /** The sealed device label, stored opaque. */
  device: string | null
  /** A browser's ticket in place of `attestation` (passkeys protocol). */
  ticket: string | null
  appVersion: string | null
  capabilities: SessionCapability[] | null
  /**
   * The account the device expects the key to be (ADR 0039): the session
   * opens only into it, never creating one.
   */
  accountId: string | null
  /**
   * A renewal: the id of the live phone session this one replaces, whose
   * bearer token the request carries ("Renewing a session" in the protocol).
   * Never with a ticket.
   */
  renews: string | null
}

export interface PasskeyAddFields {
  challengeToken: unknown
  response: unknown
  wrapId: string | null
  wrap: string | null
  label: string | null
}

export interface WebSignupFields extends PasskeyAddFields {
  device: string | null
  appVersion: string | null
  capabilities: SessionCapability[] | null
}

export interface WebRecoveryFields {
  turnstileToken: unknown
}

export interface PasskeyWrapFields {
  credentialId: unknown
  wrapId: string
  keyEpoch: number
  wrap: string
}

export interface PasskeyRemoveFields {
  credentialId: unknown
}

export interface AccountRekeyFields {
  newAccountPub: string
  keyEpoch: number
  /** The caller's label re-sealed under the new key. */
  device: string | null
  /** The key history, sealed under the new key; stored opaque. */
  history: string
  /** A wrap of the new key from the step-up's passkey. */
  passkeyWrap: { credentialId: unknown; wrapId: string; wrap: string } | null
}

const APP_VERSION_PATTERN = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/

/**
 * An optional `appVersion` (`major.minor.patch`, at most 32 characters):
 * null when absent, undefined when malformed (`bad_request`).
 */
export const parseAppVersion = (value: unknown): string | null | undefined => {
  if (value === undefined || value === null) return null
  return typeof value === 'string' &&
    value.length <= ACCOUNT_LIMITS.appVersionChars &&
    APP_VERSION_PATTERN.test(value)
    ? value
    : undefined
}

/**
 * What an app says it does, on session open and refresh. `sync-everyone`:
 * it turns Cloud Sync on by itself only for a new install, so `everyone`'s
 * Cloud Sync may reach it (witness-work ADR 0040 §2).
 */
export const SESSION_CAPABILITIES = ['sync-everyone'] as const
export type SessionCapability = (typeof SESSION_CAPABILITIES)[number]

const CAPABILITY_PATTERN = /^[a-z0-9-]+$/

/**
 * An optional `capabilities` (an array of at most 16 names of at most 32
 * characters, `a-z0-9-`): the known ones, once each; null when absent,
 * undefined when malformed (`bad_request`). Names this server doesn't know
 * are dropped, so a newer app can send ones it adds later.
 */
export const parseCapabilities = (
  value: unknown
): SessionCapability[] | null | undefined => {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value) || value.length > ACCOUNT_LIMITS.capabilities)
    return undefined
  const known = new Set<SessionCapability>()
  for (const name of value) {
    if (
      typeof name !== 'string' ||
      name.length > ACCOUNT_LIMITS.capabilityChars ||
      !CAPABILITY_PATTERN.test(name)
    )
      return undefined
    if ((SESSION_CAPABILITIES as readonly string[]).includes(name))
      known.add(name as SessionCapability)
  }
  return [...known]
}

/** A Turnstile token: a non-empty string of at most 2,048 characters. */
export const isTurnstileToken = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= ACCOUNT_LIMITS.turnstileTokenChars

/** A wrap: b64u of `0x01 ‖ nonce[24] ‖ ciphertext[32] ‖ tag[16]`, 73 bytes. */
export const parseWrap = (value: unknown): string | null => {
  const canonical = canonicalBytes(value, 73)
  return canonical != null && canonical === value && decodeB64u(canonical)![0] === 1
    ? canonical
    : null
}

/** An optional sealed label (≤ 512 characters); undefined when malformed. */
const optionalSealed = (
  value: unknown,
  maxChars: number
): string | null | undefined => {
  if (value === undefined || value === null) return null
  return sealed(value, maxChars) ?? undefined
}

type Fields = Record<string, unknown>

/**
 * The fields each signed op adds to `accountPub`, `ts`, and `nonce`. Null
 * means `bad_request`. `too_large` is the route's call, so `backup/put`
 * accepts any positive `size` here.
 */
export const ACCOUNT_FIELD_PARSERS = {
  'account/register': (): Fields => ({}),
  'account/info': (): Fields => ({}),
  'handoff/open': (p: Fields): HandoffOpenFields | null => {
    const channelId = id16(p.channelId)
    const verifier = canonicalBytes(p.verifier, 32)
    return channelId && verifier ? { channelId, verifier } : null
  },
  'handoff/status': (p: Fields): HandoffChannelFields | null => {
    const channelId = id16(p.channelId)
    return channelId ? { channelId } : null
  },
  'handoff/send': (p: Fields): HandoffSendFields | null => {
    const channelId = id16(p.channelId)
    const key = sealed(p.key, ACCOUNT_LIMITS.handoffKeyChars)
    return channelId && key ? { channelId, key } : null
  },
  'handoff/cancel': (p: Fields): HandoffChannelFields | null => {
    const channelId = id16(p.channelId)
    return channelId ? { channelId } : null
  },
  'backup/put': (p: Fields): BackupPutFields | null => {
    const slotId = id16(p.slotId)
    const sha256 = canonicalBytes(p.sha256, 32)
    const size = p.size
    if (!slotId || !sha256) return null
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1)
      return null
    return { slotId, size, sha256 }
  },
  'backup/list': (): Fields => ({}),
  'backup/get': (p: Fields): BackupSlotFields | null => {
    const slotId = id16(p.slotId)
    return slotId ? { slotId } : null
  },
  'backup/delete': (p: Fields): BackupDeleteFields | null => {
    if (p.slotId === undefined || p.slotId === null) return { slotId: null }
    const slotId = id16(p.slotId)
    return slotId ? { slotId } : null
  },
  'session/open': (p: Fields): SessionOpenFields | null => {
    const attestation = p.attestation ?? null
    if (attestation !== null && !isPlainObject(attestation)) return null
    const ticket = p.ticket ?? null
    if (ticket !== null && typeof ticket !== 'string') return null
    // A ticket stands in for the attestation; never both.
    if (ticket !== null && attestation !== null) return null
    const appVersion = parseAppVersion(p.appVersion)
    const capabilities = parseCapabilities(p.capabilities)
    const device = optionalSealed(p.device, ACCOUNT_LIMITS.sessionDeviceChars)
    const accountId = p.accountId ?? null
    if (accountId !== null && !isAccountId(accountId)) return null
    // Session ids have the same shape as account ids. Browsers never renew.
    const renews = p.renews ?? null
    if (renews !== null && (!isAccountId(renews) || ticket !== null)) return null
    if (appVersion === undefined || capabilities === undefined || device === undefined)
      return null
    return { attestation, device, ticket, appVersion, capabilities, accountId, renews }
  },
  // The envelope proves the account key: a leaked token alone can't ask.
  'sync/request': (): Fields => ({}),
  'passkey/add': (p: Fields): PasskeyAddFields | null => {
    if (p.challengeToken === undefined || p.response === undefined) return null
    const label = optionalSealed(p.label, ACCOUNT_LIMITS.passkeyLabelChars)
    if (label === undefined) return null
    const hasWrap = p.wrap !== undefined && p.wrap !== null
    const hasWrapId = p.wrapId !== undefined && p.wrapId !== null
    if (hasWrap !== hasWrapId) return null
    if (!hasWrap)
      return { challengeToken: p.challengeToken, response: p.response, wrapId: null, wrap: null, label }
    const wrapId = id16(p.wrapId)
    const wrap = parseWrap(p.wrap)
    return wrapId && wrap
      ? { challengeToken: p.challengeToken, response: p.response, wrapId, wrap, label }
      : null
  },
  'passkey/wrap': (p: Fields): PasskeyWrapFields | null => {
    const wrapId = id16(p.wrapId)
    const wrap = parseWrap(p.wrap)
    const keyEpoch = p.keyEpoch
    if (!wrapId || !wrap || p.credentialId === undefined) return null
    if (typeof keyEpoch !== 'number' || !Number.isSafeInteger(keyEpoch) || keyEpoch < 0)
      return null
    return { credentialId: p.credentialId, wrapId, keyEpoch, wrap }
  },
  'passkey/remove': (p: Fields): PasskeyRemoveFields | null =>
    p.credentialId === undefined ? null : { credentialId: p.credentialId },
  'web/signup': (p: Fields): WebSignupFields | null => {
    const passkey = ACCOUNT_FIELD_PARSERS['passkey/add'](p)
    const device = optionalSealed(p.device, ACCOUNT_LIMITS.sessionDeviceChars)
    const appVersion = parseAppVersion(p.appVersion)
    const capabilities = parseCapabilities(p.capabilities)
    if (!passkey || device === undefined || appVersion === undefined || capabilities === undefined)
      return null
    return { ...passkey, device, appVersion, capabilities }
  },
  'web/recovery': (p: Fields): WebRecoveryFields | null =>
    isTurnstileToken(p.turnstileToken) ? { turnstileToken: p.turnstileToken } : null,
  'account/rekey': (p: Fields): AccountRekeyFields | null => {
    const newAccountPub = publicKey(p.newAccountPub)
    const keyEpoch = p.keyEpoch
    const device = optionalSealed(p.device, ACCOUNT_LIMITS.sessionDeviceChars)
    const history = sealed(p.history, ACCOUNT_LIMITS.keyHistoryChars)
    if (!newAccountPub || !history || device === undefined) return null
    if (typeof keyEpoch !== 'number' || !Number.isSafeInteger(keyEpoch) || keyEpoch < 0)
      return null
    const wrap = p.passkeyWrap
    if (wrap === undefined || wrap === null)
      return { newAccountPub, keyEpoch, device, history, passkeyWrap: null }
    if (!isPlainObject(wrap) || wrap.credentialId === undefined) return null
    const wrapId = id16(wrap.wrapId)
    const sealedWrap = parseWrap(wrap.wrap)
    return wrapId && sealedWrap
      ? {
          newAccountPub,
          keyEpoch,
          device,
          history,
          passkeyWrap: { credentialId: wrap.credentialId, wrapId, wrap: sealedWrap },
        }
      : null
  },
} satisfies Record<AccountsOp, (payload: Fields) => object | null>

export type AccountFields<K extends AccountsOp> = NonNullable<
  ReturnType<(typeof ACCOUNT_FIELD_PARSERS)[K]>
>

/** The new phone's requests: plain JSON, authorized by the claim token. */
export interface HandoffTokenRequest {
  channelId: string
  claimToken: string
}

export interface HandoffClaimRequest extends HandoffTokenRequest {
  claimPub: string
  hello: string
}

export const parseHandoffTokenRequest = (
  body: unknown
): HandoffTokenRequest | null => {
  if (!isPlainObject(body)) return null
  const channelId = id16(body.channelId)
  const claimToken = id16(body.claimToken)
  return channelId && claimToken ? { channelId, claimToken } : null
}

export const parseHandoffClaimRequest = (
  body: unknown
): HandoffClaimRequest | null => {
  const base = parseHandoffTokenRequest(body)
  if (!base || !isPlainObject(body)) return null
  const claimPub = publicKey(body.claimPub)
  const hello = sealed(body.hello, ACCOUNT_LIMITS.handoffHelloChars)
  return claimPub && hello ? { ...base, claimPub, hello } : null
}

const over = (value: unknown, max: number) =>
  typeof value === 'string' && value.length > max

/** A sealed blob's cap broken, for `too_large` instead of `bad_request`. */
export const handoffBlobTooLarge = (body: unknown): boolean => {
  if (!isPlainObject(body)) return false
  return (
    over(body.hello, ACCOUNT_LIMITS.handoffHelloChars) ||
    over(body.key, ACCOUNT_LIMITS.handoffKeyChars)
  )
}

/** The session's sealed device label over its cap (`too_large`). */
export const sessionDeviceTooLarge = (payload: unknown): boolean =>
  isPlainObject(payload) &&
  over(payload.device, ACCOUNT_LIMITS.sessionDeviceChars)

/** A key change's history or device label over its cap (`too_large`). */
export const rekeyTooLarge = (payload: unknown): boolean =>
  isPlainObject(payload) &&
  (over(payload.history, ACCOUNT_LIMITS.keyHistoryChars) ||
    over(payload.device, ACCOUNT_LIMITS.sessionDeviceChars))

/** A serialized WebAuthn response over 16 KiB (`too_large`). */
export const passkeyResponseTooLarge = (value: unknown): boolean =>
  value !== undefined &&
  JSON.stringify(value).length > ACCOUNT_LIMITS.passkeyResponseChars

/** A passkey's sealed label over its cap, or its response over 16 KiB (`too_large`). */
export const passkeyAddTooLarge = (payload: unknown): boolean =>
  isPlainObject(payload) &&
  (over(payload.label, ACCOUNT_LIMITS.passkeyLabelChars) ||
    passkeyResponseTooLarge(payload.response))

/** `web/signup`'s passkey label, session device label, or response over its cap (`too_large`). */
export const webSignupTooLarge = (payload: unknown): boolean =>
  isPlainObject(payload) &&
  (over(payload.label, ACCOUNT_LIMITS.passkeyLabelChars) ||
    over(payload.device, ACCOUNT_LIMITS.sessionDeviceChars) ||
    passkeyResponseTooLarge(payload.response))

// --- Sessions ----------------------------------------------------------------

/**
 * What an `account-session` attestation's `contentHash` and `requestHash`
 * must both be (on `POST /attestation/v1/challenge` and in the session's
 * `attestation`), so it covers the account key: lowercase hex
 * `SHA-256(UTF-8("ww-account/v1/session\n" + accountPub))`.
 */
export const sessionAttestationHash = (accountPub: string): Promise<string> =>
  sha256Hex(`ww-account/v1/session\n${accountPub}`)

/** A refresh token as presented, in its parts. */
export interface RefreshToken {
  /** The session it names. */
  sessionId: string
  /** `<sessionId>.<secret>`, what its MAC covers. */
  body: string
  /** The MAC's 32 bytes. */
  mac: Uint8Array
  /** The whole token. */
  token: string
}

/** The bytes of b64u for exactly `size` bytes, in its canonical spelling. */
const canonicalB64u = (value: string, size: number): Uint8Array | null => {
  const bytes = decodeB64u(value)
  return bytes != null &&
    bytes.length === size &&
    bytesToBase64Url(bytes) === value
    ? bytes
    : null
}

/**
 * A refresh token, opaque to the app: `<sessionId>.<secret>.<mac>`, the
 * session's id (b64u, 16 bytes), then b64u of 32 bytes twice, each in its
 * canonical spelling. Null for anything else, including the two-part
 * `<sessionId>.<secret>` tokens from before the MAC.
 */
export const parseRefreshToken = (value: unknown): RefreshToken | null => {
  if (typeof value !== 'string') return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [sessionId, secret, mac] = parts
  const macBytes = canonicalB64u(mac, 32)
  return canonicalB64u(sessionId, 16) && canonicalB64u(secret, 32) && macBytes
    ? { sessionId, body: `${sessionId}.${secret}`, mac: macBytes, token: value }
    : null
}

// --- Approving a browser from a phone (passkeys-protocol.md) -----------------

export interface ApprovalChannelRequest {
  channelId: string
}

export interface ApprovalOpenRequest extends ApprovalChannelRequest {
  verifier: string
  browserVerifier: string
  hello: string
}

export interface ApprovalClaimRequest extends ApprovalChannelRequest {
  claimToken: string
  phonePub: string
}

export interface ApprovalSendRequest extends ApprovalChannelRequest {
  key: string
}

export interface ApprovalBrowserRequest extends ApprovalChannelRequest {
  browserToken: string
}

export const parseApprovalChannel = (body: unknown): ApprovalChannelRequest | null => {
  if (!isPlainObject(body)) return null
  const channelId = id16(body.channelId)
  return channelId ? { channelId } : null
}

export const parseApprovalOpen = (body: unknown): ApprovalOpenRequest | null => {
  const base = parseApprovalChannel(body)
  if (!base || !isPlainObject(body)) return null
  const verifier = canonicalBytes(body.verifier, 32)
  const browserVerifier = canonicalBytes(body.browserVerifier, 32)
  const hello = sealed(body.hello, ACCOUNT_LIMITS.approvalHelloChars)
  return verifier && browserVerifier && hello
    ? { ...base, verifier, browserVerifier, hello }
    : null
}

export const parseApprovalClaim = (body: unknown): ApprovalClaimRequest | null => {
  const base = parseApprovalChannel(body)
  if (!base || !isPlainObject(body)) return null
  const claimToken = id16(body.claimToken)
  const phonePub = publicKey(body.phonePub)
  return claimToken && phonePub ? { ...base, claimToken, phonePub } : null
}

export const parseApprovalSend = (body: unknown): ApprovalSendRequest | null => {
  const base = parseApprovalChannel(body)
  if (!base || !isPlainObject(body)) return null
  const key = sealed(body.key, ACCOUNT_LIMITS.approvalKeyChars)
  return key ? { ...base, key } : null
}

export const parseApprovalBrowser = (body: unknown): ApprovalBrowserRequest | null => {
  const base = parseApprovalChannel(body)
  if (!base || !isPlainObject(body)) return null
  const browserToken = id16(body.browserToken)
  return browserToken ? { ...base, browserToken } : null
}

/** An approval blob over its cap, for `too_large` instead of `bad_request`. */
export const approvalBlobTooLarge = (body: unknown): boolean =>
  isPlainObject(body) &&
  (over(body.hello, ACCOUNT_LIMITS.approvalHelloChars) ||
    over(body.key, ACCOUNT_LIMITS.approvalKeyChars))
