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
import { curve25519 } from '@/lib/curve25519'
import { open, seal } from '@/lib/sealedBlob'

export const HANDOFF_LINK_BASE = 'https://ww-proxy.leviwilkerson.com/h'

const LINK_VERSION = '1'
const CHANNEL_BYTES = 16
const PUBLIC_KEY_BYTES = 32
const SECRET_BYTES = 16
const ACCOUNT_KEY_BYTES = 32
const CLAIM_TOKEN_BYTES = 16
const NONCE_BYTES = 12

const OFFER_CHARS = 86

export const HANDOFF_CODE_DIGITS = 6

export const HANDOFF_HELLO_MAX = 64

const LABEL = 'ww-account/v1/handoff'

export type HandoffOffer = {
  channelId: string

  offerPub: string

  secret: Uint8Array
}

export type HandoffKeyPair = { privateKey: Uint8Array; publicKey: string }

export type HandoffHello = {
  deviceName: string
  platform: 'ios' | 'android'
  model: string
  appVersion: string
}

export type HandoffAccountKey = {
  accountKey: Uint8Array
  accountId: string
}

export type HandoffKeys = {
  helloKey: Uint8Array
  keyKey: Uint8Array

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

export function buildHandoffLink(offer: HandoffOffer): string {
  const bytes = concatBytes(
    fromB64u(offer.channelId),
    fromB64u(offer.offerPub),
    offer.secret
  )
  if (bytes.length !== CHANNEL_BYTES + PUBLIC_KEY_BYTES + SECRET_BYTES)
    throw new Error('Malformed handoff offer')
  return `${HANDOFF_LINK_BASE}#${LINK_VERSION}${toB64u(bytes)}`
}

export type ParsedHandoffLink =
  | { ok: true; offer: HandoffOffer }
  | { ok: false; problem: 'notHandoff' | 'version' | 'damaged' }

const LINK_PATTERN =
  /^https:\/\/ww-proxy\.leviwilkerson\.com\/h\/?(?:\?[^#]*)?(?:#(.*))?$/i

export const isHandoffLink = (text: string) => LINK_PATTERN.test(text.trim())

export function parseHandoffLink(text: string): ParsedHandoffLink {
  const match = LINK_PATTERN.exec(text.trim())
  if (!match) return { ok: false, problem: 'notHandoff' }
  const fragment = match[1] ?? ''
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

export function deriveVerifier(claimToken: string): string {
  return toB64u(sha256(fromB64u(claimToken)))
}

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
  const codeBytes = expand(sha256, prk, info('code'), 4)
  const value =
    ((codeBytes[0] << 24) |
      (codeBytes[1] << 16) |
      (codeBytes[2] << 8) |
      codeBytes[3]) >>>
    0
  return {
    helloKey: expand(sha256, prk, info('hello'), 32),
    keyKey: expand(sha256, prk, info('key'), 32),
    code: String(value % 10 ** HANDOFF_CODE_DIGITS).padStart(
      HANDOFF_CODE_DIGITS,
      '0'
    ),
  }
}

export const formatHandoffCode = (code: string) =>
  `${code.slice(0, 3)} ${code.slice(3)}`

const helloAad = (channelId: string) => `${LABEL}/hello\n${channelId}`
const keyAad = (channelId: string) => `${LABEL}/key\n${channelId}`

const cut = (value: string, max: number) =>
  Array.from(value).slice(0, max).join('')

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
