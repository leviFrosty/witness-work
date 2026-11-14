import type { Environment } from '../types'
import { bytesToBase64Url, sha256Bytes } from '../crypto'
import { BUDDIES_ID_PATTERN, decodeB64u, isPlainObject } from '../buddies/contracts'
import { isAccountId } from './contracts'
import { accessTokenIssuer, derivedHmacKey, MIN_TOKEN_SECRET_CHARS } from './tokens'

/**
 * Challenges and tickets (witness-work `docs/passkeys-protocol.md`,
 * "Challenges and tickets"). Both are stateless: a JSON payload and its
 * HMAC-SHA256, `<b64u(payload)>.<b64u(mac)>`, under their own Worker secret
 * (`PASSKEY_CHALLENGE_SECRET`, `ACCOUNT_TICKET_SECRET`; never the access
 * token's). The payload names its `typ` (`ww-challenge` or `ww-ticket`), the
 * environment's issuer, a 16-byte id, and an expiry, so neither passes for
 * the other or for an access token. Issuing one writes nothing; using one
 * records its id in `used_token_ids` in the same D1 batch as what it
 * authorizes (`batchUsing` in src/accounts/passkeyStore.ts).
 *
 * Privacy: tickets and challenge tokens are credentials; never log them.
 */

const MINUTE_MS = 60_000

export const PASSKEY_TOKEN_LIMITS = {
  challengeMs: 5 * MINUTE_MS,
  signupChallengeMs: 10 * MINUTE_MS,
  ticketMs: 2 * MINUTE_MS,
  /** The contract's cap on a ticket's length. */
  ticketChars: 512,
  /** Far beyond any challenge token this worker mints. */
  challengeTokenChars: 1_024,
} as const

export const CHALLENGE_PURPOSES = [
  'sign-in',
  'step-up',
  'register',
  'signup',
] as const
export type ChallengePurpose = (typeof CHALLENGE_PURPOSES)[number]

export const TICKET_KINDS = ['passkey', 'approval', 'recovery'] as const
export type TicketKind = (typeof TICKET_KINDS)[number]

export interface ChallengeClaims {
  id: string
  /** Epoch ms. */
  expiresAt: number
  purpose: ChallengePurpose
  rpId: string
  /** b64u of the 32 random bytes in `options.challenge`. */
  challenge: string
  /** `step-up` and `register`: the session it's for. */
  sessionId?: string
  /** `register` and `signup`: the account (minted, for `signup`). */
  accountId?: string
  /** `register` and `signup`: the user handle in the options. */
  userHandle?: string
}

export interface TicketClaims {
  id: string
  expiresAt: number
  kind: TicketKind
  accountId: string
  /** `passkey`: b64u SHA-256 of the credential id. */
  credentialHash?: string
  /** `approval`: the channel. */
  channelId?: string
  /** `approval`: the phone's session that approved. */
  actorSessionId?: string
}

type Typ = 'ww-challenge' | 'ww-ticket'

interface TokenKeys {
  issuer: string
  key: CryptoKey
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })

const SECRET_NAMES: Record<Typ, 'PASSKEY_CHALLENGE_SECRET' | 'ACCOUNT_TICKET_SECRET'> = {
  'ww-challenge': 'PASSKEY_CHALLENGE_SECRET',
  'ww-ticket': 'ACCOUNT_TICKET_SECRET',
}

export type PasskeyTokenEnv = Pick<
  Environment,
  'PASSKEY_CHALLENGE_SECRET' | 'ACCOUNT_TICKET_SECRET' | 'APP_ATTEST_ENVIRONMENT'
>

const keysFor = async (
  env: PasskeyTokenEnv,
  typ: Typ
): Promise<TokenKeys | null> => {
  const issuer = accessTokenIssuer(env)
  const secret = env[SECRET_NAMES[typ]]?.trim()
  if (!issuer || !secret || secret.length < MIN_TOKEN_SECRET_CHARS) return null
  return { issuer, key: await derivedHmacKey(`ww-account/v1/${typ}`, secret) }
}

/** Whether this worker can mint and check both challenges and tickets. */
export const passkeyTokensReady = async (
  env: PasskeyTokenEnv
): Promise<boolean> =>
  (await keysFor(env, 'ww-challenge')) != null &&
  (await keysFor(env, 'ww-ticket')) != null

const newId = (): string =>
  bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)))

const sign = async (
  env: PasskeyTokenEnv,
  typ: Typ,
  body: Record<string, unknown>
): Promise<string> => {
  const keys = await keysFor(env, typ)
  if (!keys) throw new Error(`passkeys: ${typ} secret is not configured`)
  const payload = bytesToBase64Url(
    encoder.encode(JSON.stringify({ typ, iss: keys.issuer, ...body }))
  )
  const mac = await crypto.subtle.sign('HMAC', keys.key, encoder.encode(payload))
  return `${payload}.${bytesToBase64Url(new Uint8Array(mac))}`
}

/** The payload of a token of `typ` this worker signed and that hasn't expired. */
const open = async (
  env: PasskeyTokenEnv,
  typ: Typ,
  token: unknown,
  maxChars: number,
  now: number
): Promise<Record<string, unknown> | null> => {
  if (typeof token !== 'string' || token.length > maxChars) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const keys = await keysFor(env, typ)
  if (!keys) return null
  const mac = decodeB64u(parts[1])
  if (!mac || mac.length !== 32) return null
  const valid = await crypto.subtle.verify(
    'HMAC',
    keys.key,
    mac,
    encoder.encode(parts[0])
  )
  if (!valid) return null
  const bytes = decodeB64u(parts[0])
  if (!bytes) return null
  let body: unknown
  try {
    body = JSON.parse(decoder.decode(bytes))
  } catch {
    return null
  }
  if (!isPlainObject(body)) return null
  if (body.typ !== typ || body.iss !== keys.issuer) return null
  if (!isId(body.id)) return null
  if (typeof body.exp !== 'number' || body.exp <= now) return null
  return body
}

/** A 16-byte id (the token's own, a session's, a channel's), b64u. */
const isId = (value: unknown): value is string =>
  typeof value === 'string' && BUDDIES_ID_PATTERN.test(value)

const optionalId = (
  value: unknown,
  valid: (value: unknown) => value is string = isId
): string | undefined | null =>
  value === undefined ? undefined : valid(value) ? value : null

export const issueChallengeToken = (
  env: PasskeyTokenEnv,
  claims: Omit<ChallengeClaims, 'id' | 'expiresAt'>,
  now: number = Date.now()
): Promise<{ token: string; claims: ChallengeClaims }> => {
  const lifetime =
    claims.purpose === 'signup'
      ? PASSKEY_TOKEN_LIMITS.signupChallengeMs
      : PASSKEY_TOKEN_LIMITS.challengeMs
  const full: ChallengeClaims = { ...claims, id: newId(), expiresAt: now + lifetime }
  return sign(env, 'ww-challenge', {
    id: full.id,
    exp: full.expiresAt,
    purpose: full.purpose,
    rpId: full.rpId,
    challenge: full.challenge,
    sessionId: full.sessionId,
    accountId: full.accountId,
    userHandle: full.userHandle,
  }).then((token) => ({ token, claims: full }))
}

/** A challenge token's claims, or null: malformed, forged, or expired. */
export const openChallengeToken = async (
  env: PasskeyTokenEnv,
  token: unknown,
  now: number = Date.now()
): Promise<ChallengeClaims | null> => {
  const body = await open(
    env,
    'ww-challenge',
    token,
    PASSKEY_TOKEN_LIMITS.challengeTokenChars,
    now
  )
  if (!body) return null
  const purpose = body.purpose as ChallengePurpose
  if (!CHALLENGE_PURPOSES.includes(purpose)) return null
  if (typeof body.rpId !== 'string' || typeof body.challenge !== 'string')
    return null
  const sessionId = optionalId(body.sessionId)
  const accountId = optionalId(body.accountId, isAccountId)
  if (sessionId === null || accountId === null) return null
  if (body.userHandle !== undefined && typeof body.userHandle !== 'string')
    return null
  return {
    id: body.id as string,
    expiresAt: body.exp as number,
    purpose,
    rpId: body.rpId,
    challenge: body.challenge,
    ...(sessionId ? { sessionId } : {}),
    ...(accountId ? { accountId } : {}),
    ...(typeof body.userHandle === 'string'
      ? { userHandle: body.userHandle }
      : {}),
  }
}

export const issueTicket = async (
  env: PasskeyTokenEnv,
  claims: Omit<TicketClaims, 'id' | 'expiresAt'>,
  now: number = Date.now()
): Promise<{ ticket: string; claims: TicketClaims }> => {
  const full: TicketClaims = {
    ...claims,
    id: newId(),
    expiresAt: now + PASSKEY_TOKEN_LIMITS.ticketMs,
  }
  const ticket = await sign(env, 'ww-ticket', {
    id: full.id,
    exp: full.expiresAt,
    kind: full.kind,
    accountId: full.accountId,
    credentialHash: full.credentialHash,
    channelId: full.channelId,
    actorSessionId: full.actorSessionId,
  })
  return { ticket, claims: full }
}

/** A ticket's claims, or null: malformed, forged, over 512 characters, or expired. */
export const openTicket = async (
  env: PasskeyTokenEnv,
  ticket: unknown,
  now: number = Date.now()
): Promise<TicketClaims | null> => {
  const body = await open(
    env,
    'ww-ticket',
    ticket,
    PASSKEY_TOKEN_LIMITS.ticketChars,
    now
  )
  if (!body) return null
  const kind = body.kind as TicketKind
  if (!TICKET_KINDS.includes(kind) || !isAccountId(body.accountId)) return null
  const channelId = optionalId(body.channelId)
  const actorSessionId = optionalId(body.actorSessionId)
  if (channelId === null || actorSessionId === null) return null
  if (kind === 'approval' && (!channelId || !actorSessionId)) return null
  const credentialHash = body.credentialHash
  if (credentialHash !== undefined && typeof credentialHash !== 'string')
    return null
  if (kind === 'passkey' && credentialHash === undefined) return null
  return {
    id: body.id as string,
    expiresAt: body.exp as number,
    kind,
    accountId: body.accountId,
    ...(credentialHash !== undefined ? { credentialHash } : {}),
    ...(channelId ? { channelId } : {}),
    ...(actorSessionId ? { actorSessionId } : {}),
  }
}

/** b64u SHA-256 of a credential id's UTF-8, as a `passkey` ticket names it. */
export const credentialHash = async (credentialId: string): Promise<string> =>
  bytesToBase64Url(await sha256Bytes(encoder.encode(credentialId)))
