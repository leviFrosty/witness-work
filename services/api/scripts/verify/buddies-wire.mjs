/**
 * Plain-Node Buddies wire client for the verify fuzzer (no TS, no deps).
 *
 * Mirrors src/buddies/envelope.ts + src/buddies/contracts.ts. The unit test
 * scripts/verify/buddies-wire.test.ts fails if these drift from the server.
 */

import { webcrypto } from 'node:crypto'

const { subtle } = webcrypto
const encoder = new TextEncoder()

export const SIGNING_CONTEXT = 'ww-buddies/v1\n'

/** Copy of BUDDIES_LIMITS fields the fuzzer probes (checked by the unit test). */
export const WIRE_LIMITS = {
  slotsPlusOpenInvites: 50,
  openInvites: 50,
  timestampSkewMs: 5 * 60 * 1000,
  rosterBytes: 128 * 1024,
  cardBytes: 16 * 1024,
  eventBytes: 8 * 1024,
  inviteBytes: 4 * 1024,
  claimBytes: 4 * 1024,
  templateChars: 200,
  templates: 96,
  kindChars: 40,
  requestBytes: 256 * 1024,
  maxInviteLifetimeMs: 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000,
  blobBytes: 1024 * 1024,
  maxBlobLifetimeMs: 90 * 24 * 60 * 60 * 1000,
  blobDeleteIds: 50,
}

/** `blob/put` carries its signed envelope in these headers; the body is the blob. */
export const ENVELOPE_HEADERS = { payload: 'x-buddies-payload', signature: 'x-buddies-signature' }

/** Per-caller requests per minute by edge tier (BUDDIES_ABUSE_LIMITS.edge). */
export const WIRE_EDGE_LIMITS = {
  unsigned: 120,
  register: 60,
  read: 600,
  write: 600,
  blobPut: 60,
  blobGet: 600,
}

/** Owner ops: a bearer request sends their fields as plain JSON (no envelope). */
export const OWNER_OPS = [
  'inbox/sync',
  'inbox/delete',
  'device/register',
  'device/unregister',
  'slot/add',
  'slot/remove',
  'roster/put',
  'invite/create',
  'invite/delete',
  'blob/delete',
]

export const SIGNED_OPS = [
  'inbox/register',
  'inbox/sync',
  'inbox/delete',
  'device/register',
  'device/unregister',
  'slot/add',
  'slot/remove',
  'roster/put',
  'invite/create',
  'invite/delete',
  'blob/delete',
  'card/put',
  'event/put',
  'slot/leave',
  'slot/seal',
]
export const UNSIGNED_OPS = ['invite/fetch', 'invite/claim']
export const ALL_OPS = [...SIGNED_OPS, ...UNSIGNED_OPS]

export const b64u = (bytes) => Buffer.from(bytes).toString('base64url')
export const fromB64u = (text) => new Uint8Array(Buffer.from(text, 'base64url'))

/** Builds the exact bytes an op's signature covers. */
export const signedMessage = (op, payloadBytes) => {
  const prefix = encoder.encode(`${SIGNING_CONTEXT}${op}\n`)
  const message = new Uint8Array(prefix.length + payloadBytes.length)
  message.set(prefix, 0)
  message.set(payloadBytes, prefix.length)
  return message
}

const PKCS8_ED25519_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04,
  0x22, 0x04, 0x20,
])

/** Ed25519 key from a 32-byte seed, so fuzz identities are reproducible. */
export const signingKeyFromSeed = async (seed) => {
  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + 32)
  pkcs8.set(PKCS8_ED25519_PREFIX)
  pkcs8.set(seed, PKCS8_ED25519_PREFIX.length)
  const privateKey = await subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign'])
  const jwk = await subtle.exportKey('jwk', privateKey)
  return {
    publicKey: jwk.x,
    sign: async (message) =>
      new Uint8Array(await subtle.sign({ name: 'Ed25519' }, privateKey, message)),
  }
}

/** `{payload, signature}` over exact payload bytes (`payload` may be a pre-serialized string). */
export const signedEnvelope = async (op, payload, key) => {
  const bytes = encoder.encode(typeof payload === 'string' ? payload : JSON.stringify(payload))
  return { payload: b64u(bytes), signature: b64u(await key.sign(signedMessage(op, bytes))) }
}

export const unsignedEnvelope = (payload) => ({
  payload: b64u(encoder.encode(typeof payload === 'string' ? payload : JSON.stringify(payload))),
})

export const sha256 = async (bytes) => new Uint8Array(await subtle.digest('SHA-256', bytes))

/** A bearer `inbox/live` or `blob/put`'s fields: b64u(UTF-8 JSON) for `x-buddies-payload`. */
export const fieldsHeader = (fields) => b64u(encoder.encode(JSON.stringify(fields)))

// --- Accounts (sessions) --------------------------------------------------

export const ACCOUNT_SIGNING_CONTEXT = 'ww-account/v1\n'

/** The bytes an account-key envelope's signature covers (`src/accounts/contracts.ts`). */
export const accountSignedMessage = (op, payloadBytes) => {
  const prefix = encoder.encode(`${ACCOUNT_SIGNING_CONTEXT}${op}\n`)
  const message = new Uint8Array(prefix.length + payloadBytes.length)
  message.set(prefix, 0)
  message.set(payloadBytes, prefix.length)
  return message
}

/** A self-signed account envelope for `op` (e.g. `session/open`). */
export const accountEnvelope = async (op, key, fields = {}) => {
  const bytes = encoder.encode(
    JSON.stringify({ accountPub: key.publicKey, ts: Date.now(), nonce: b64u(webcrypto.getRandomValues(new Uint8Array(16))), ...fields })
  )
  return { payload: b64u(bytes), signature: b64u(await key.sign(accountSignedMessage(op, bytes))) }
}

/** What the account key signs to link an inbox (`inbox/register`'s `account` proof). */
export const inboxLinkMessage = (accountId, inboxId, ownerPub) =>
  encoder.encode(`${ACCOUNT_SIGNING_CONTEXT}inbox/link\n${accountId}\n${inboxId}\n${ownerPub}`)
