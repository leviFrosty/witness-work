import { expand, extract, hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import {
  concatBytes,
  fromB64u,
  fromUtf8,
  RELAY_ID_PATTERN,
  toB64u,
  utf8,
} from '@/lib/bytes'
import { appLinkBase, appLinkFragment } from '@/constants/appLinks'
import { curve25519 } from '@/lib/curve25519'
import { open, seal } from '@/lib/sealedBlob'

/**
 * Set Up Another Device (ADR 0026, docs/accounts-protocol.md "Handoff"): the QR
 * link, and the keys, code, and sealed blobs both phones derive from it. Pure:
 * callers supply randomness.
 *
 * The old phone shows `channelId ‖ offerPub ‖ secret` in a link fragment the
 * server never sees. The new phone answers with its own temporary X25519 key
 * and a `claimToken` only someone holding the secret can make. Both then derive
 * the same keys and six-digit code from the X25519 secret, salted with the QR's
 * secret and bound to all three public values, so a server that swaps a key
 * gets a different code and blobs that won't open.
 */

/** The fragment's version; a newer one asks the User to update. */
const LINK_VERSION = '1'
const CHANNEL_BYTES = 16
const PUBLIC_KEY_BYTES = 32
const SECRET_BYTES = 16
const ACCOUNT_KEY_BYTES = 32
const CLAIM_TOKEN_BYTES = 16
const NONCE_BYTES = 12
/** `channelId ‖ offerPub ‖ secret`, 64 bytes: 86 b64u characters. */
const OFFER_CHARS = 86

export const HANDOFF_CODE_DIGITS = 6
/** Hello strings are cut to this many characters. */
export const HANDOFF_HELLO_MAX = 64

const LABEL = 'ww-account/v1/handoff'

/** What the QR code carries. */
export type HandoffOffer = {
  /** 16 random bytes, b64u: the only part the server learns. */
  channelId: string
  /** The old phone's temporary X25519 public key, b64u. */
  offerPub: string
  /** 16 random bytes. Never leaves the two phones. */
  secret: Uint8Array
}

/** A temporary X25519 key pair, made for one handoff and forgotten after it. */
export type HandoffKeyPair = { privateKey: Uint8Array; publicKey: string }

/** What the new phone tells the old one, sealed. */
export type HandoffHello = {
  deviceName: string
  platform: 'ios' | 'android'
  model: string
  appVersion: string
}

/** What the old phone sends once the User allows it, sealed. */
export type HandoffAccountKey = {
  accountKey: Uint8Array
  accountId: string
}

/** The keys and code both phones derive once the channel is claimed. */
export type HandoffKeys = {
  helloKey: Uint8Array
  keyKey: Uint8Array
  /** Six digits, e.g. `"042917"`; show with `formatHandoffCode`. */
  code: string
}

export function createHandoffKeyPair(
  randomBytes: (length: number) => Uint8Array
): HandoffKeyPair {
  const privateKey = randomBytes(32)
  return {
    privateKey,
    publicKey: toB64u(curve25519().x25519.getPublicKey(privateKey)),
  }
}

/** A new offer for the old phone: a channel, a temporary key, and a secret. */
export function createHandoffOffer(
  randomBytes: (length: number) => Uint8Array
): { offer: HandoffOffer; keyPair: HandoffKeyPair } {
  const keyPair = createHandoffKeyPair(randomBytes)
  return {
    offer: {
      channelId: toB64u(randomBytes(CHANNEL_BYTES)),
      offerPub: keyPair.publicKey,
      secret: randomBytes(SECRET_BYTES),
    },
    keyPair,
  }
}

/**
 * `https://ww-proxy.leviwilkerson.com/h#1<b64u(channelId ‖ offerPub ‖
 * secret)>`, or `https://witnesswork.app/accounts/handoff#1…` once new links
 * move to the apex (`CREATE_LINKS_ON_NEW_HOST`).
 */
export function buildHandoffLink(offer: HandoffOffer): string {
  const bytes = concatBytes(
    fromB64u(offer.channelId),
    fromB64u(offer.offerPub),
    offer.secret
  )
  if (bytes.length !== CHANNEL_BYTES + PUBLIC_KEY_BYTES + SECRET_BYTES)
    throw new Error('Malformed handoff offer')
  return `${appLinkBase('handoff')}#${LINK_VERSION}${toB64u(bytes)}`
}

export type ParsedHandoffLink =
  | { ok: true; offer: HandoffOffer }
  /**
   * `notHandoff`: some other link or text. `version`: a handoff link from a
   * newer app. `damaged`: a handoff link with a cut or altered fragment.
   */
  | { ok: false; problem: 'notHandoff' | 'version' | 'damaged' }

/**
 * Whether `text` is a Set Up Another Device link at all, valid or not: the old
 * host's `/h`, or `/accounts/handoff` on any host (`appLinkFragment`).
 */
export const isHandoffLink = (text: string) =>
  appLinkFragment(text, 'handoff') !== null

/** Reads a scanned or opened link. */
export function parseHandoffLink(text: string): ParsedHandoffLink {
  const fragment = appLinkFragment(text, 'handoff')
  if (fragment === null) return { ok: false, problem: 'notHandoff' }
  if (!fragment) return { ok: false, problem: 'damaged' }
  if (!fragment.startsWith(LINK_VERSION))
    return { ok: false, problem: /^\d/.test(fragment) ? 'version' : 'damaged' }
  const body = fragment.slice(LINK_VERSION.length)
  if (body.length !== OFFER_CHARS || !/^[A-Za-z0-9_-]+$/.test(body))
    return { ok: false, problem: 'damaged' }
  const bytes = fromB64u(body)
  const channel = bytes.subarray(0, CHANNEL_BYTES)
  const offerPub = bytes.subarray(
    CHANNEL_BYTES,
    CHANNEL_BYTES + PUBLIC_KEY_BYTES
  )
  const secret = bytes.slice(CHANNEL_BYTES + PUBLIC_KEY_BYTES)
  // A key of all zeros has no shared secret; nothing real makes one.
  if (offerPub.every((byte) => byte === 0))
    return { ok: false, problem: 'damaged' }
  return {
    ok: true,
    offer: {
      channelId: toB64u(channel),
      offerPub: toB64u(offerPub),
      secret,
    },
  }
}

/** `HKDF-SHA256(secret, "", "…/claim\n" + channelId, 16)`, b64u. */
export function deriveClaimToken(
  secret: Uint8Array,
  channelId: string
): string {
  return toB64u(
    hkdf(
      sha256,
      secret,
      new Uint8Array(0),
      utf8(`${LABEL}/claim\n${channelId}`),
      CLAIM_TOKEN_BYTES
    )
  )
}

/** `b64u(SHA-256(claimToken bytes))`: what the server keeps. */
export function deriveVerifier(claimToken: string): string {
  return toB64u(sha256(fromB64u(claimToken)))
}

/**
 * Both phones' keys and code. Each passes its own private key and the other
 * phone's public key; `offerPub` and `claimPub` are always the old and new
 * phone's, so both derive the same transcript.
 */
export function deriveHandoffKeys({
  privateKey,
  peerPublicKey,
  secret,
  channelId,
  offerPub,
  claimPub,
}: {
  privateKey: Uint8Array
  peerPublicKey: string
  secret: Uint8Array
  channelId: string
  offerPub: string
  claimPub: string
}): HandoffKeys {
  const shared = curve25519().x25519.getSharedSecret(
    privateKey,
    fromB64u(peerPublicKey)
  )
  const prk = extract(sha256, shared, secret)
  const transcript = `${channelId}\n${offerPub}\n${claimPub}`
  const info = (purpose: string) => utf8(`${LABEL}/${purpose}\n${transcript}`)
  return {
    helloKey: expand(sha256, prk, info('hello'), 32),
    keyKey: expand(sha256, prk, info('key'), 32),
    code: sixDigitCode(expand(sha256, prk, info('code'), 4)),
  }
}

/**
 * Four bytes as a big-endian `uint32 mod 1,000,000`, six digits with leading
 * zeros: the code both sides show. Approving a browser shares it.
 */
export function sixDigitCode(bytes: Uint8Array): string {
  const value =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
  return String(value % 10 ** HANDOFF_CODE_DIGITS).padStart(
    HANDOFF_CODE_DIGITS,
    '0'
  )
}

/** `123 456`. */
export const formatHandoffCode = (code: string) =>
  `${code.slice(0, 3)} ${code.slice(3)}`

const helloAad = (channelId: string) => `${LABEL}/hello\n${channelId}`
const keyAad = (channelId: string) => `${LABEL}/key\n${channelId}`

/** Cuts to `max` characters without splitting one. */
export const cut = (value: string, max: number) =>
  Array.from(value).slice(0, max).join('')

/**
 * One plain line, cut to `max`: control and format characters (newlines, bidi
 * overrides) go, so text from the other side can't draw extra lines on screen.
 */
export const plainLine = (text: string, max: number) =>
  cut(
    text
      .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    max
  )

/** The hello as sent: strings trimmed and cut to the protocol's limits. */
export function normalizeHello(hello: HandoffHello): HandoffHello {
  return {
    deviceName: cut(hello.deviceName.trim(), HANDOFF_HELLO_MAX),
    platform: hello.platform,
    model: cut(hello.model.trim(), HANDOFF_HELLO_MAX),
    appVersion: cut(hello.appVersion.trim(), 32),
  }
}

export function sealHello(
  keys: HandoffKeys,
  channelId: string,
  hello: HandoffHello,
  randomBytes: (length: number) => Uint8Array
): string {
  return seal(
    keys.helloKey,
    utf8(JSON.stringify(normalizeHello(hello))),
    helloAad(channelId),
    randomBytes(NONCE_BYTES)
  )
}

/**
 * The new phone's hello. Throws when it doesn't open, which means the keys
 * differ: the claim wasn't made with this QR's secret and key, or something
 * swapped one.
 */
export function openHello(
  keys: HandoffKeys,
  channelId: string,
  blob: string
): HandoffHello {
  const value: unknown = JSON.parse(
    fromUtf8(open(keys.helloKey, blob, helloAad(channelId)))
  )
  if (typeof value !== 'object' || value === null)
    throw new Error('Malformed hello')
  const { deviceName, platform, model, appVersion } = value as Record<
    string,
    unknown
  >
  if (
    typeof deviceName !== 'string' ||
    (platform !== 'ios' && platform !== 'android') ||
    typeof model !== 'string' ||
    typeof appVersion !== 'string'
  )
    throw new Error('Malformed hello')
  return normalizeHello({ deviceName, platform, model, appVersion })
}

export function sealAccountKey(
  keys: HandoffKeys,
  channelId: string,
  value: HandoffAccountKey,
  randomBytes: (length: number) => Uint8Array
): string {
  if (value.accountKey.length !== ACCOUNT_KEY_BYTES)
    throw new Error('Account key must be 32 bytes')
  return seal(
    keys.keyKey,
    utf8(
      JSON.stringify({
        v: 1,
        accountKey: toB64u(value.accountKey),
        accountId: value.accountId,
      })
    ),
    keyAad(channelId),
    randomBytes(NONCE_BYTES)
  )
}

/** The sealed account key. Throws when it doesn't open or isn't well formed. */
export function openAccountKey(
  keys: HandoffKeys,
  channelId: string,
  blob: string
): HandoffAccountKey {
  const value: unknown = JSON.parse(
    fromUtf8(open(keys.keyKey, blob, keyAad(channelId)))
  )
  if (typeof value !== 'object' || value === null)
    throw new Error('Malformed account key')
  const { v, accountKey, accountId } = value as Record<string, unknown>
  if (
    v !== 1 ||
    typeof accountKey !== 'string' ||
    typeof accountId !== 'string' ||
    !RELAY_ID_PATTERN.test(accountId)
  )
    throw new Error('Malformed account key')
  const bytes = fromB64u(accountKey)
  if (bytes.length !== ACCOUNT_KEY_BYTES)
    throw new Error('Malformed account key')
  return { accountKey: bytes, accountId }
}
