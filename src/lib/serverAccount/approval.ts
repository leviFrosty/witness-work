import { expand, extract, hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { BETA_API_BASE_URL, PRODUCTION_API_BASE_URLS } from '@/constants/apis'
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
  plainLine,
  deriveVerifier,
  type HandoffKeyPair,
  sixDigitCode,
} from '@/lib/serverAccount/handoff'

export const APPROVAL_PRODUCTION_ORIGINS = ['https://app.witnesswork.app']
export const APPROVAL_BETA_ORIGINS = ['https://beta.app.witnesswork.app']

export const APPROVAL_LOCAL_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:19006',
  'http://localhost:4173',
  'http://localhost:5173',
]

function originOf(url: string): string {
  try {
    return new URL(url.trim()).origin
  } catch {
    return url
  }
}

export function approvalOriginsFor({
  apiBaseUrl,
  dev,
}: {
  apiBaseUrl: string
  dev: boolean
}): string[] {
  const api = originOf(apiBaseUrl)
  if (PRODUCTION_API_BASE_URLS.includes(api))
    return [...APPROVAL_PRODUCTION_ORIGINS]
  if (api !== BETA_API_BASE_URL) return [...APPROVAL_LOCAL_ORIGINS]
  return dev
    ? [...APPROVAL_BETA_ORIGINS, ...APPROVAL_LOCAL_ORIGINS]
    : [...APPROVAL_BETA_ORIGINS]
}

const LINK_VERSION = '1'
const CHANNEL_BYTES = 16
const PUBLIC_KEY_BYTES = 32
const SECRET_BYTES = 16
const ACCOUNT_KEY_BYTES = 32
const TOKEN_BYTES = 16
const NONCE_BYTES = 12

const OFFER_CHARS = 86

export const APPROVAL_TEXT_MAX = 64

export const APPROVAL_BLOB_MAX = 1024

const LABEL = 'ww-account/v1/approval'

export type ApprovalOffer = {
  channelId: string

  browserPub: string

  secret: Uint8Array
}

export type ApprovalHello = {
  browser: string
  system: string
  appVersion: string
}

export type ApprovalAccountKey = {
  accountKey: Uint8Array
  accountId: string

  deviceName: string
}

export type ApprovalKeys = {
  keyKey: Uint8Array

  code: string
}

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
  | {
      ok: false
      problem: 'notApproval' | 'wrongHost' | 'version' | 'damaged'
    }

const LINK_PATTERN = /^(https?:\/\/[^/?#\s]+)\/approve(?:#(.*))?$/
const SCHEME_PATTERN = /^https?:\/\//i

const withScheme = (text: string) =>
  text.trim().replace(SCHEME_PATTERN, (scheme) => scheme.toLowerCase())

export const isApprovalLink = (text: string) =>
  LINK_PATTERN.test(withScheme(text))

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

export function createBrowserToken(
  randomBytes: (length: number) => Uint8Array
): { browserToken: string; browserVerifier: string } {
  const browserToken = toB64u(randomBytes(TOKEN_BYTES))
  return { browserToken, browserVerifier: deriveVerifier(browserToken) }
}

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
  browser: plainLine(hello.browser, APPROVAL_TEXT_MAX),
  system: plainLine(hello.system, APPROVAL_TEXT_MAX),
  appVersion: plainLine(hello.appVersion, 32),
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
