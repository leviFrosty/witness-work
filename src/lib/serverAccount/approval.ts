import { expand, extract, hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { PRODUCTION_API_BASE_URL } from '@/constants/apis'
import {
  concatBytes,
  fromB64u,
  fromUtf8,
  RELAY_ID_PATTERN,
  toB64u,
  utf8,
} from '@/lib/bytes'
import { curve25519 } from '@/lib/curve25519'
import { open, seal } from '@/lib/sealedBlob'
import {
  createHandoffKeyPair,
  cut,
  deriveVerifier,
  type HandoffKeyPair,
  sixDigitCode,
} from '@/lib/serverAccount/handoff'

/**
 * Approving a browser from a phone (ADR 0038, docs/passkeys-protocol.md
 * "Approving a browser from a phone"): Set Up Another Device with the roles
 * turned around. The browser, which has no account yet, shows `channelId ‖
 * browserPub ‖ secret` in a link fragment the server never sees; a signed-in
 * phone scans it from inside the app and sends the account key. Pure: callers
 * supply randomness and the origins they accept.
 *
 * The hello is sealed under a key from the QR's secret alone, since the browser
 * sends it before any phone exists. The account key's key and the six-digit
 * code come from the X25519 secret, salted with the QR's secret and bound to
 * both public keys, so a server that swaps one gets a different code and a blob
 * that won't open.
 */

/** The production web app, and its beta under the same RP ID. */
export const APPROVAL_PRODUCTION_ORIGINS = [
  'https://app.witnesswork.app',
  'https://beta.app.witnesswork.app',
]
export const APPROVAL_DEV_ORIGINS = ['https://app-dev.witnesswork.app']
/** A local web build, as the dev worker's RP table lists it. */
export const APPROVAL_LOCAL_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:19006',
  'http://localhost:4173',
  'http://localhost:5173',
]

/**
 * The web app origins whose codes a build accepts: the production web app's for
 * the production API, the dev web app's for any other, and a local web build's
 * too in a dev build that isn't on the production API. `approvalRuntime.ts` has
 * this build's.
 */
export function approvalOriginsFor({
  apiBaseUrl,
  dev,
}: {
  apiBaseUrl: string
  dev: boolean
}): string[] {
  if (apiBaseUrl.replace(/\/+$/, '') === PRODUCTION_API_BASE_URL)
    return [...APPROVAL_PRODUCTION_ORIGINS]
  return dev
    ? [...APPROVAL_DEV_ORIGINS, ...APPROVAL_LOCAL_ORIGINS]
    : [...APPROVAL_DEV_ORIGINS]
}

/** The fragment's version; a newer one asks the User to update. */
const LINK_VERSION = '1'
const CHANNEL_BYTES = 16
const PUBLIC_KEY_BYTES = 32
const SECRET_BYTES = 16
const ACCOUNT_KEY_BYTES = 32
const TOKEN_BYTES = 16
const NONCE_BYTES = 12
/** `channelId ‖ browserPub ‖ secret`, 64 bytes: 86 b64u characters. */
const OFFER_CHARS = 86

/** Hello strings and the approver's name are cut to this many characters. */
export const APPROVAL_TEXT_MAX = 64
/** The server refuses a sealed hello or key past this (`too_large`). */
export const APPROVAL_BLOB_MAX = 1024

const LABEL = 'ww-account/v1/approval'

/** What the QR code carries. */
export type ApprovalOffer = {
  /** 16 random bytes, b64u: the only part the server learns. */
  channelId: string
  /** The browser's temporary X25519 public key, b64u. */
  browserPub: string
  /** 16 random bytes. Never leaves the browser and the phone. */
  secret: Uint8Array
}

/** What the browser tells the phone, sealed: "Chrome", "macOS". */
export type ApprovalHello = {
  browser: string
  system: string
  appVersion: string
}

/** What the phone sends once the User approves, sealed. */
export type ApprovalAccountKey = {
  accountKey: Uint8Array
  accountId: string
  /** The approving phone's name, shown as "Approved by …". */
  deviceName: string
}

/** The keys and code both sides derive once the channel is claimed. */
export type ApprovalKeys = {
  keyKey: Uint8Array
  /** Six digits, e.g. `"042917"`; show with `formatHandoffCode`. */
  code: string
}

/** A new offer for the browser: a channel, a temporary key, and a secret. */
export function createApprovalOffer(
  randomBytes: (length: number) => Uint8Array
): { offer: ApprovalOffer; keyPair: HandoffKeyPair } {
  const keyPair = createHandoffKeyPair(randomBytes)
  return {
    offer: {
      channelId: toB64u(randomBytes(CHANNEL_BYTES)),
      browserPub: keyPair.publicKey,
      secret: randomBytes(SECRET_BYTES),
    },
    keyPair,
  }
}

/** `<origin>/approve#1<b64u(channelId ‖ browserPub ‖ secret)>`. */
export function buildApprovalLink(
  offer: ApprovalOffer,
  origin: string
): string {
  const bytes = concatBytes(
    fromB64u(offer.channelId),
    fromB64u(offer.browserPub),
    offer.secret
  )
  if (bytes.length !== CHANNEL_BYTES + PUBLIC_KEY_BYTES + SECRET_BYTES)
    throw new Error('Malformed approval offer')
  return `${origin.replace(/\/+$/, '')}/approve#${LINK_VERSION}${toB64u(bytes)}`
}

export type ParsedApprovalLink =
  | { ok: true; offer: ApprovalOffer }
  /**
   * `notApproval`: some other link or text. `wrongHost`: an approval link from
   * a host this build doesn't trust. `version`: one from a newer app.
   * `damaged`: a cut or altered fragment.
   */
  | {
      ok: false
      problem: 'notApproval' | 'wrongHost' | 'version' | 'damaged'
    }

/**
 * `<scheme>://<host>/approve#<fragment>`, the contract's form exactly: no other
 * path, no trailing slash, no query. Scheme and host compare
 * case-insensitively.
 */
const LINK_PATTERN = /^(https?:\/\/[^/?#\s]+)\/approve(?:#(.*))?$/
const SCHEME_PATTERN = /^https?:\/\//i

/** The link with its scheme lowercased, as URLs compare it. */
const withScheme = (text: string) =>
  text.trim().replace(SCHEME_PATTERN, (scheme) => scheme.toLowerCase())

/** Whether `text` is an approval link at all, from any host, valid or not. */
export const isApprovalLink = (text: string) =>
  LINK_PATTERN.test(withScheme(text))

/**
 * Reads a code scanned inside the app. Only `origins` (`appApprovalOrigins`)
 * are accepted, compared exactly.
 */
export function parseApprovalLink(
  text: string,
  origins: readonly string[]
): ParsedApprovalLink {
  const match = LINK_PATTERN.exec(withScheme(text))
  if (!match) return { ok: false, problem: 'notApproval' }
  if (!origins.includes(match[1].toLowerCase()))
    return { ok: false, problem: 'wrongHost' }
  const fragment = match[2] ?? ''
  if (!fragment) return { ok: false, problem: 'damaged' }
  // The version is the digits before the body, and the body's length is
  // fixed, so a body that starts with a digit doesn't read as a version.
  const version = fragment.slice(0, -OFFER_CHARS)
  if (fragment.length <= OFFER_CHARS || !/^\d+$/.test(version))
    return {
      ok: false,
      problem: /^[02-9]/.test(fragment) ? 'version' : 'damaged',
    }
  if (version !== LINK_VERSION) return { ok: false, problem: 'version' }
  const body = fragment.slice(version.length)
  if (!/^[A-Za-z0-9_-]+$/.test(body)) return { ok: false, problem: 'damaged' }
  const bytes = fromB64u(body)
  const browserPub = bytes.subarray(
    CHANNEL_BYTES,
    CHANNEL_BYTES + PUBLIC_KEY_BYTES
  )
  // A key of all zeros has no shared secret; nothing real makes one.
  if (browserPub.every((byte) => byte === 0))
    return { ok: false, problem: 'damaged' }
  return {
    ok: true,
    offer: {
      channelId: toB64u(bytes.subarray(0, CHANNEL_BYTES)),
      browserPub: toB64u(browserPub),
      secret: bytes.slice(CHANNEL_BYTES + PUBLIC_KEY_BYTES),
    },
  }
}

/** `HKDF-SHA256(secret, "", "…/claim\n" + channelId, 16)`, b64u. */
export function deriveApprovalClaimToken(
  secret: Uint8Array,
  channelId: string
): string {
  return toB64u(
    hkdf(
      sha256,
      secret,
      new Uint8Array(0),
      utf8(`${LABEL}/claim\n${channelId}`),
      TOKEN_BYTES
    )
  )
}

/** The browser's own token for its ops, and the server's copy of it. */
export function createBrowserToken(
  randomBytes: (length: number) => Uint8Array
): { browserToken: string; browserVerifier: string } {
  const browserToken = toB64u(randomBytes(TOKEN_BYTES))
  return { browserToken, browserVerifier: deriveVerifier(browserToken) }
}

/** `HKDF-SHA256(secret, "", "…/hello\n" + channelId, 32)`. */
export function deriveApprovalHelloKey(
  secret: Uint8Array,
  channelId: string
): Uint8Array {
  return hkdf(
    sha256,
    secret,
    new Uint8Array(0),
    utf8(`${LABEL}/hello\n${channelId}`),
    32
  )
}

/**
 * Both sides' key and code. Each passes its own private key and the other's
 * public key; `browserPub` and `phonePub` are always the browser's and the
 * phone's, so both derive the same transcript.
 */
export function deriveApprovalKeys({
  privateKey,
  peerPublicKey,
  secret,
  channelId,
  browserPub,
  phonePub,
}: {
  privateKey: Uint8Array
  peerPublicKey: string
  secret: Uint8Array
  channelId: string
  browserPub: string
  phonePub: string
}): ApprovalKeys {
  const shared = curve25519().x25519.getSharedSecret(
    privateKey,
    fromB64u(peerPublicKey)
  )
  const prk = extract(sha256, shared, secret)
  const transcript = `${channelId}\n${browserPub}\n${phonePub}`
  const info = (purpose: string) => utf8(`${LABEL}/${purpose}\n${transcript}`)
  return {
    keyKey: expand(sha256, prk, info('key'), 32),
    code: sixDigitCode(expand(sha256, prk, info('code'), 4)),
  }
}

const helloAad = (channelId: string) => `${LABEL}/hello\n${channelId}`
const keyAad = (channelId: string) => `${LABEL}/key\n${channelId}`

const normalizeHello = (hello: ApprovalHello): ApprovalHello => ({
  browser: cut(hello.browser.trim(), APPROVAL_TEXT_MAX),
  system: cut(hello.system.trim(), APPROVAL_TEXT_MAX),
  appVersion: cut(hello.appVersion.trim(), 32),
})

export function sealApprovalHello(
  helloKey: Uint8Array,
  channelId: string,
  hello: ApprovalHello,
  randomBytes: (length: number) => Uint8Array
): string {
  return seal(
    helloKey,
    utf8(JSON.stringify(normalizeHello(hello))),
    helloAad(channelId),
    randomBytes(NONCE_BYTES)
  )
}

/** The browser's hello. Throws when it doesn't open or isn't well formed. */
export function openApprovalHello(
  helloKey: Uint8Array,
  channelId: string,
  blob: string
): ApprovalHello {
  const value: unknown = JSON.parse(
    fromUtf8(open(helloKey, blob, helloAad(channelId)))
  )
  const { browser, system, appVersion } = (value ?? {}) as Record<
    string,
    unknown
  >
  if (
    typeof browser !== 'string' ||
    typeof system !== 'string' ||
    typeof appVersion !== 'string'
  )
    throw new Error('Malformed hello')
  return normalizeHello({ browser, system, appVersion })
}

export function sealApprovalKey(
  keyKey: Uint8Array,
  channelId: string,
  value: ApprovalAccountKey,
  randomBytes: (length: number) => Uint8Array
): string {
  if (value.accountKey.length !== ACCOUNT_KEY_BYTES)
    throw new Error('Account key must be 32 bytes')
  return seal(
    keyKey,
    utf8(
      JSON.stringify({
        v: 1,
        accountKey: toB64u(value.accountKey),
        accountId: value.accountId,
        deviceName: cut(value.deviceName.trim(), APPROVAL_TEXT_MAX),
      })
    ),
    keyAad(channelId),
    randomBytes(NONCE_BYTES)
  )
}

/** The sealed account key. Throws when it doesn't open or isn't well formed. */
export function openApprovalKey(
  keyKey: Uint8Array,
  channelId: string,
  blob: string
): ApprovalAccountKey {
  const value: unknown = JSON.parse(
    fromUtf8(open(keyKey, blob, keyAad(channelId)))
  )
  const { v, accountKey, accountId, deviceName } = (value ?? {}) as Record<
    string,
    unknown
  >
  if (
    v !== 1 ||
    typeof accountKey !== 'string' ||
    typeof accountId !== 'string' ||
    !RELAY_ID_PATTERN.test(accountId) ||
    typeof deviceName !== 'string'
  )
    throw new Error('Malformed account key')
  const bytes = fromB64u(accountKey)
  if (bytes.length !== ACCOUNT_KEY_BYTES)
    throw new Error('Malformed account key')
  return {
    accountKey: bytes,
    accountId,
    deviceName: cut(deviceName.trim(), APPROVAL_TEXT_MAX),
  }
}
