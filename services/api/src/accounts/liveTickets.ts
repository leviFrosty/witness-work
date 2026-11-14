import type { AppContext, Environment } from '../types'
import { bytesToBase64Url, sha256Bytes } from '../crypto'
import { BUDDIES_ID_PATTERN, decodeB64u, isPlainObject } from '../buddies/contracts'
import { buddiesErrorResponse } from '../buddies/errorResponse'
import { authenticateAccount, readPlainJson, type AccountAuth } from './auth'
import { isAccountId } from './contracts'
import { SESSION_PLATFORMS, type SessionPlatform } from './schema'
import { guarded, refuseAtEdge } from './signed'
import { isSyncSlotId } from './syncContracts'
import {
  ACCESS_TOKEN_SECONDS,
  IAT_SKEW_SECONDS,
  accessTokenIssuer,
  usableSecret,
} from './tokens'

/**
 * Live socket tickets (witness-work `docs/passkeys-protocol.md`, "Live
 * sockets on the web"). A browser can't set headers on a WebSocket, and
 * Cloudflare's logs record `Sec-WebSocket-Protocol` in full (they redact only
 * `Authorization`), so a browser never offers its access token there. It
 * trades the token for a ticket with `POST /accounts/v1/live/ticket` and
 * offers `ticket.<ticket>` (src/liveSubprotocol.ts).
 *
 * A ticket is `b64u(iv ‖ AES-256-GCM(UTF-8 JSON claims)).b64u(HMAC-SHA256)`,
 * 466 characters (the claims padded with spaces to 288 bytes, so the length
 * shows neither the socket nor the id's): a random 12-byte IV, and a MAC
 * over the first part.
 * Both keys come from the Worker secret `LIVE_TICKET_SECRET` (never the
 * access token secret), each the SHA-256 of its own label and the secret
 * (`ww-live/v1/ticket-cipher`, `ww-live/v1/ticket`), as the access token
 * secret's derived keys are (src/accounts/tokens.ts). The MAC is checked
 * before anything is decrypted or parsed. Sealed, a logged ticket names no
 * account, session, slot, or inbox; it opens one socket kind for one id for
 * 30 seconds and calls no other route.
 *
 * Not single-use, and nothing is stored: within its 30 seconds a ticket
 * reopens its socket after a drop. But each socket's attachment keeps the
 * SHA-256 of its ticket's MAC (`hash`, src/liveSubprotocol.ts), and the
 * Durable Object refuses a second socket on a ticket while one is open (409
 * `conflict`), so a logged copy can't push the User's own sockets past the
 * cap.
 *
 * Claims: `typ` (`ww-live`), `iss` (the env's issuer, as the access token's),
 * `sub` (the account id), `sid` (the session id), `platform`, `socket`
 * (`sync` or `buddies`), `id` (the slot id or the inbox id), `tokenExp` (the
 * access token's `exp`, so the socket still closes then), and `exp` (30
 * seconds after minting, or the token's `exp` if sooner), in epoch seconds.
 *
 * Rotation: no previous secret is kept. Replacing `LIVE_TICKET_SECRET` fails
 * the tickets of the last 30 seconds once, and the app mints another.
 *
 * Privacy: sealed, a ticket names no id, but it opens a socket; never log it.
 */

export const LIVE_TICKET_TYPE = 'ww-live'
/** How long a ticket opens sockets, seconds. */
export const LIVE_TICKET_SECONDS = 30
export const LIVE_SOCKETS = ['sync', 'buddies'] as const
export type LiveSocket = (typeof LIVE_SOCKETS)[number]

/** Clock skew between isolates allowed on `exp` and `tokenExp`, seconds. */
const SKEW_SECONDS = 5
/** The least a minted ticket lives; a token closer to expiry mints none. */
const MIN_TICKET_MS = 1_000
/** Far beyond any ticket this worker mints; longer input isn't parsed. */
const MAX_TICKET_CHARS = 1_024
const IV_BYTES = 12
/**
 * Claims are padded with trailing spaces to this many bytes before sealing,
 * so a ticket's length shows neither its socket kind nor its id's length.
 */
const PADDED_CLAIM_BYTES = 288
const GCM_TAG_BYTES = 16
const MAC_BYTES = 32

/** What a verified ticket says. */
export interface LiveTicketClaims {
  account: AccountAuth
  /** The slot id (`sync`) or the inbox id (`buddies`). */
  id: string
  /** When the access token it was minted with expires, epoch ms. */
  tokenExpiresAt: number
  /**
   * b64u(SHA-256 of the ticket's MAC): the same for every copy of the
   * ticket, and opens nothing. The DO allows one open socket per hash.
   */
  hash: string
}

export interface LiveTicketKey {
  issuer: string
  /** AES-256-GCM: seals the claims. */
  cipherKey: CryptoKey
  /** HMAC-SHA256 over the sealed claims. */
  macKey: CryptoKey
}

const encoder = new TextEncoder()
const keyCache = new Map<string, Promise<Omit<LiveTicketKey, 'issuer'>>>()

const ticketKeys = (secret: string): Promise<Omit<LiveTicketKey, 'issuer'>> => {
  let cached = keyCache.get(secret)
  if (!cached) {
    cached = (async () => {
      const labelled = (label: string) =>
        sha256Bytes(encoder.encode(`${label}\n${secret}`))
      const [cipherKey, macKey] = await Promise.all([
        labelled('ww-live/v1/ticket-cipher').then((bytes) =>
          crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
            'encrypt',
            'decrypt',
          ])
        ),
        labelled('ww-live/v1/ticket').then((bytes) =>
          crypto.subtle.importKey(
            'raw',
            bytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign', 'verify']
          )
        ),
      ])
      return { cipherKey, macKey }
    })()
    cached.catch(() => keyCache.delete(secret))
    keyCache.set(secret, cached)
  }
  return cached
}

let warnedSharedSecret = false

/**
 * The keys tickets are sealed with, or null when they're off: no
 * `LIVE_TICKET_SECRET` of at least 32 characters (warned once), one equal to
 * `ACCOUNT_TOKEN_SECRET` or `ACCOUNT_TOKEN_SECRET_PREVIOUS` (warned once), or
 * no `APP_ATTEST_ENVIRONMENT` to name the issuer.
 */
export const liveTicketKey = async (
  env: Pick<
    Environment,
    | 'LIVE_TICKET_SECRET'
    | 'APP_ATTEST_ENVIRONMENT'
    | 'ACCOUNT_TOKEN_SECRET'
    | 'ACCOUNT_TOKEN_SECRET_PREVIOUS'
  >
): Promise<LiveTicketKey | null> => {
  const issuer = accessTokenIssuer(env)
  const secret = usableSecret(env.LIVE_TICKET_SECRET, 'LIVE_TICKET_SECRET')
  if (!issuer || !secret) return null
  const shared =
    secret === env.ACCOUNT_TOKEN_SECRET?.trim()
      ? 'ACCOUNT_TOKEN_SECRET'
      : secret === env.ACCOUNT_TOKEN_SECRET_PREVIOUS?.trim()
        ? 'ACCOUNT_TOKEN_SECRET_PREVIOUS'
        : null
  if (shared) {
    if (!warnedSharedSecret) {
      warnedSharedSecret = true
      console.warn(`accounts: LIVE_TICKET_SECRET equals ${shared}; tickets are off`)
    }
    return null
  }
  return { issuer, ...(await ticketKeys(secret)) }
}

const isLiveSocket = (value: unknown): value is LiveSocket =>
  LIVE_SOCKETS.includes(value as LiveSocket)

/** True when `id` is the shape `socket`'s id takes. */
const isSocketId = (socket: LiveSocket, id: unknown): id is string =>
  socket === 'sync'
    ? isSyncSlotId(id)
    : typeof id === 'string' && BUDDIES_ID_PATTERN.test(id)

const isSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const isPlatform = (value: unknown): value is SessionPlatform =>
  SESSION_PLATFORMS.includes(value as SessionPlatform)

/** b64u(SHA-256(`mac`)): a ticket's `hash`. */
const macHash = async (mac: Uint8Array): Promise<string> =>
  bytesToBase64Url(await sha256Bytes(mac))

/**
 * A ticket for `socket` and `id`, from a verified access token expiring at
 * `tokenExpiresAt` (epoch ms), or null when the token has less than a second
 * left. `expiresAt` is epoch ms.
 */
export const mintLiveTicket = async (
  key: LiveTicketKey,
  grant: {
    account: AccountAuth
    socket: LiveSocket
    id: string
    tokenExpiresAt: number
  },
  now: number = Date.now()
): Promise<{ ticket: string; expiresAt: number } | null> => {
  const tokenExp = Math.floor(grant.tokenExpiresAt / 1_000)
  const exp = Math.min(Math.floor(now / 1_000) + LIVE_TICKET_SECONDS, tokenExp)
  if (exp * 1_000 - now < MIN_TICKET_MS) return null
  const json = JSON.stringify({
    typ: LIVE_TICKET_TYPE,
    iss: key.issuer,
    sub: grant.account.accountId,
    sid: grant.account.sessionId,
    platform: grant.account.platform,
    socket: grant.socket,
    id: grant.id,
    tokenExp,
    exp,
  })
  const plaintext = encoder.encode(
    json.padEnd(Math.max(PADDED_CLAIM_BYTES, json.length), ' ')
  )
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key.cipherKey, plaintext)
  )
  const box = new Uint8Array(IV_BYTES + sealed.length)
  box.set(iv)
  box.set(sealed, IV_BYTES)
  const body = bytesToBase64Url(box)
  const mac = await crypto.subtle.sign('HMAC', key.macKey, encoder.encode(body))
  return {
    ticket: `${body}.${bytesToBase64Url(new Uint8Array(mac))}`,
    expiresAt: exp * 1_000,
  }
}

/**
 * The claims of a ticket this worker minted for `socket` that hasn't expired,
 * or null. Checks, in order: two base64url parts, the MAC (before anything
 * is decrypted or parsed), the seal, then `typ`, `iss`, `socket`, `exp` and
 * `tokenExp` (unexpired; `exp` no later than `tokenExp`, nor than 30 seconds
 * from now, `tokenExp` nor than one access token lifetime from now, each
 * plus 5 seconds of skew, and the token's `iat` skew for `tokenExp`), and
 * the shapes of `sub`, `sid`, `platform`, and `id`. A `dev` ticket never
 * passes on production.
 */
export const verifyLiveTicket = async (
  key: LiveTicketKey,
  ticket: string,
  socket: LiveSocket,
  now: number = Date.now()
): Promise<LiveTicketClaims | null> => {
  if (ticket.length > MAX_TICKET_CHARS) return null
  const parts = ticket.split('.')
  if (parts.length !== 2) return null
  const [body, macPart] = parts
  const mac = decodeB64u(macPart)
  if (!mac || mac.length !== MAC_BYTES) return null
  const valid = await crypto.subtle.verify(
    'HMAC',
    key.macKey,
    mac,
    encoder.encode(body)
  )
  if (!valid) return null

  const box = decodeB64u(body)
  if (!box || box.length < IV_BYTES + GCM_TAG_BYTES) return null
  let claims: unknown
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: box.subarray(0, IV_BYTES) },
      key.cipherKey,
      box.subarray(IV_BYTES)
    )
    claims = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(plaintext)
    )
  } catch {
    return null
  }
  if (!isPlainObject(claims)) return null
  const { typ, iss, sub, sid, platform, id, tokenExp, exp } = claims
  if (typ !== LIVE_TICKET_TYPE || iss !== key.issuer) return null
  if (claims.socket !== socket) return null
  if (!isSeconds(exp) || !isSeconds(tokenExp)) return null
  if (exp * 1_000 <= now || tokenExp * 1_000 <= now) return null
  const seconds = now / 1_000
  if (exp > tokenExp) return null
  if (exp > seconds + LIVE_TICKET_SECONDS + SKEW_SECONDS) return null
  if (tokenExp > seconds + ACCESS_TOKEN_SECONDS + IAT_SKEW_SECONDS + SKEW_SECONDS)
    return null
  if (!isAccountId(sub)) return null
  if (typeof sid !== 'string' || !BUDDIES_ID_PATTERN.test(sid)) return null
  if (!isPlatform(platform)) return null
  if (platform === 'dev' && key.issuer === 'ww-api/production') return null
  if (!isSocketId(socket, id)) return null
  return {
    account: { accountId: sub, sessionId: sid, platform },
    id,
    tokenExpiresAt: tokenExp * 1_000,
    hash: await macHash(mac),
  }
}

/**
 * A browser socket's ticket, verified for `socket`: its claims, or the
 * refusal. 503 `disabled` without a ticket key; 401 `unauthorized` (with
 * `WWW-Authenticate`, as for a bad token) for a missing, malformed, forged,
 * expired, or other-socket ticket, so the app mints a fresh one.
 */
export const admitLiveTicket = async (
  env: Environment,
  ticket: string | null,
  socket: LiveSocket
): Promise<{ ok: true; claims: LiveTicketClaims } | { ok: false; response: Response }> => {
  const key = await liveTicketKey(env)
  if (!key) return { ok: false, response: buddiesErrorResponse('disabled') }
  const claims = ticket ? await verifyLiveTicket(key, ticket, socket) : null
  return claims
    ? { ok: true, claims }
    : { ok: false, response: buddiesErrorResponse('unauthorized') }
}

/**
 * `POST /accounts/v1/live/ticket` `{ socket, id }`: a ticket a browser
 * offers to open that live socket (`sync`: its own slot id; `buddies`: its
 * inbox id). Bearer, with a live session (`requireLiveSession`: a signed-out
 * or revoked session mints none, though a socket it already opened stays
 * until its token expires); counts against the read edge tier. Checks only
 * the id's shape (400 `bad_request`); the socket runs every other check when
 * it opens, as it does for a native upgrade. 401 `unauthorized` for a token
 * with less than a second left, so the app refreshes it first. 503
 * `disabled` without a ticket key.
 *
 * Privacy: nothing here logs or reports the body, the token, or the ticket.
 */
export const handleLiveTicket = guarded('live/ticket', async (c: AppContext) => {
  const key = await liveTicketKey(c.env)
  if (!key) return buddiesErrorResponse('disabled')
  const limited = await refuseAtEdge(c, 'inbox/sync')
  if (limited) return limited
  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return auth.response
  const body = await readPlainJson(c)
  if (!isPlainObject(body)) return buddiesErrorResponse('bad_request')
  const { socket, id } = body
  if (!isLiveSocket(socket) || !isSocketId(socket, id))
    return buddiesErrorResponse('bad_request')
  const minted = await mintLiveTicket(key, {
    account: auth.account,
    socket,
    id,
    tokenExpiresAt: auth.expiresAt,
  })
  if (!minted) return buddiesErrorResponse('unauthorized')
  return c.json({ ok: true, ticket: minted.ticket, expiresAt: minted.expiresAt })
})
