import {
  BUDDIES_BLOB_PUT_OP,
  BUDDIES_ENVELOPE_HEADERS,
  BUDDIES_FIELD_PARSERS,
  BUDDIES_LIMITS,
  BUDDIES_LIVE_OP,
  BUDDIES_PAYLOAD_PARSERS,
  LEGACY_BUDDIES_ENVELOPE_HEADERS,
  decodeB64u,
  decodeSignature,
  fail,
  isPlainObject,
  ok,
  type BuddiesFields,
  type BuddiesPayloads,
  type BuddiesResult,
  type BuddiesSigningOp,
  type Signed,
} from './contracts'

/**
 * Request envelope
 * `{ "payload": b64u(UTF-8 JSON payload), "signature": b64u(Ed25519 sig) }`.
 * The live socket's upgrade and `blob/put` carry the same two values in
 * headers instead. Older app builds send the short names `p` and `s` (and
 * `x-buddies-p` / `x-buddies-s`); those are still accepted.
 *
 * The signature covers `UTF-8("ww-buddies/v1\n" + op + "\n") ‖ decoded(payload)`:
 * the exact bytes the client sent, never a re-serialization of the parsed JSON.
 */

const SIGNING_CONTEXT = 'ww-buddies/v1\n'
const encoder = new TextEncoder()

export interface Envelope {
  /** Decoded bytes of `payload`, exactly as signed. */
  payloadBytes: Uint8Array
  payload: Record<string, unknown>
  /** Raw `signature`; unsigned ops ignore it. */
  signature: unknown
}

/**
 * Reads a request body as UTF-8 text under `limit` bytes without buffering
 * past it: a declared `Content-Length` over it, or a stream that overruns
 * it, is `too_large`; an unreadable declared length, no body, or bytes that
 * aren't UTF-8 are `bad_request`. Buddies envelopes and Shared Spaces bodies
 * both read this way.
 */
export const readBodyText = async (
  request: Request,
  limit: number
): Promise<BuddiesResult<string>> => {
  const declared = request.headers.get('content-length')
  if (declared != null) {
    const length = Number(declared)
    if (Number.isNaN(length)) return fail('bad_request')
    if (length > limit) return fail('too_large')
  }
  if (!request.body) return fail('bad_request')

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => undefined)
      return fail('too_large')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return ok(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
    )
  } catch {
    return fail('bad_request')
  }
}

/**
 * Reads the request body as UTF-8 text, refusing anything over the envelope
 * ceiling without buffering it. Null means `bad_request`.
 */
export const readEnvelopeText = async (
  request: Request
): Promise<string | null> => {
  const text = await readBodyText(request, BUDDIES_LIMITS.requestBytes)
  return text.ok ? text.value : null
}

/** Parses the envelope and its payload JSON. Null means `bad_request`. */
export const parseEnvelope = (text: string): Envelope | null => {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    // Never surface the parser message: V8 quotes the offending input.
    return null
  }
  return isPlainObject(body)
    ? envelopeFromParts(body.payload ?? body.p, body.signature ?? body.s)
    : null
}

/** True when a JSON body is a signed envelope (either naming). */
export const isEnvelopeBody = (body: Record<string, unknown>): boolean =>
  'payload' in body || 'p' in body

/**
 * Decodes `payload` and its JSON; `signature` passes through. Null means
 * `bad_request`.
 */
export const envelopeFromParts = (
  encodedPayload: unknown,
  signature: unknown
): Envelope | null => {
  if (typeof encodedPayload !== 'string' || !encodedPayload) return null
  const payloadBytes = decodeB64u(encodedPayload)
  if (!payloadBytes) return null

  let payload: unknown
  try {
    payload = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
        payloadBytes
      )
    )
  } catch {
    return null
  }
  if (!isPlainObject(payload)) return null
  return { payloadBytes, payload, signature }
}

/**
 * Validates a signed op's payload (`bad_request`) and decodes its signature
 * (`bad_signature`). Verifying it is the inbox DO's job.
 */
export const signedCall = <K extends BuddiesSigningOp>(
  op: K,
  envelope: Envelope,
  now: number
): BuddiesResult<Signed<BuddiesPayloads[K]>> => {
  const payload = BUDDIES_PAYLOAD_PARSERS[op](envelope.payload, now)
  if (!payload) return fail('bad_request')
  const signature = decodeSignature(envelope.signature)
  if (!signature) return fail('bad_signature')
  return ok({ ...payload, payloadBytes: envelope.payloadBytes, signature })
}

export const isWebSocketUpgrade = (request: Request): boolean =>
  request.method === 'GET' &&
  request.headers.get('upgrade')?.trim().toLowerCase() === 'websocket'

/**
 * Reads an envelope from request headers: the long names, else the legacy
 * short ones older app builds send.
 */
export const envelopeFromHeaders = (
  headers: Headers,
  names: { payload: string; signature: string },
  legacy: { payload: string; signature: string }
): Envelope | null =>
  envelopeFromParts(
    headers.get(names.payload) ?? headers.get(legacy.payload),
    headers.get(names.signature) ?? headers.get(legacy.signature)
  )

/**
 * A signed call whose envelope rides in the `x-buddies-payload` and
 * `x-buddies-signature` headers (`inbox/live`, `blob/put`). Both the Worker
 * (to route) and the inbox DO (to verify) read it, so neither trusts the
 * other's parse.
 */
const readHeaderCall = <
  K extends typeof BUDDIES_LIVE_OP | typeof BUDDIES_BLOB_PUT_OP,
>(
  op: K,
  headers: Headers,
  now: number
): BuddiesResult<Signed<BuddiesPayloads[K]>> => {
  const envelope = envelopeFromHeaders(
    headers,
    BUDDIES_ENVELOPE_HEADERS,
    LEGACY_BUDDIES_ENVELOPE_HEADERS
  )
  return envelope ? signedCall(op, envelope, now) : fail('bad_request')
}

/** The `inbox/live` upgrade's signed call, from its headers. */
export const readLiveCall = (
  headers: Headers,
  now: number
): BuddiesResult<Signed<BuddiesPayloads[typeof BUDDIES_LIVE_OP]>> =>
  readHeaderCall(BUDDIES_LIVE_OP, headers, now)

/** The `blob/put` signed call, from its headers (the body is the blob). */
export const readBlobPutCall = (
  headers: Headers,
  now: number
): BuddiesResult<Signed<BuddiesPayloads[typeof BUDDIES_BLOB_PUT_OP]>> =>
  readHeaderCall(BUDDIES_BLOB_PUT_OP, headers, now)

/**
 * A bearer request's fields for `inbox/live` or `blob/put`: b64u(UTF-8 JSON)
 * in `x-buddies-payload`, without `ts` or `nonce`. The token authenticates
 * it, so a signature header (either naming) is `bad_request`, as is the short
 * `x-buddies-p`, which only shipped legacy builds send.
 */
export const readHeaderFields = <
  K extends typeof BUDDIES_LIVE_OP | typeof BUDDIES_BLOB_PUT_OP,
>(
  op: K,
  headers: Headers,
  now: number
): BuddiesResult<BuddiesFields<K>> => {
  if (
    headers.has(BUDDIES_ENVELOPE_HEADERS.signature) ||
    headers.has(LEGACY_BUDDIES_ENVELOPE_HEADERS.signature)
  ) {
    return fail('bad_request')
  }
  const envelope = envelopeFromParts(
    headers.get(BUDDIES_ENVELOPE_HEADERS.payload),
    undefined
  )
  const fields = envelope ? BUDDIES_FIELD_PARSERS[op](envelope.payload, now) : null
  return fields ? ok(fields) : fail('bad_request')
}

/**
 * Reads a `blob/put` body of exactly `expected` bytes (the signed `bytes`,
 * at most `limit`, `blobBytes` by default) without buffering past it: a
 * declared `Content-Length` is checked first, and the stream is cancelled one
 * chunk after it overruns. Anything past `limit` is `too_large`; any other
 * length mismatch is `bad_request`. Accounts' `backup/put` reads its blob
 * the same way under its own limit.
 */
export const readBlobBody = async (
  request: Request,
  expected: number,
  limit: number = BUDDIES_LIMITS.blobBytes
): Promise<BuddiesResult<Uint8Array>> => {
  const declared = request.headers.get('content-length')
  if (declared != null) {
    const length = Number(declared)
    if (!Number.isSafeInteger(length) || length < 0) return fail('bad_request')
    if (length > limit) return fail('too_large')
    if (length !== expected) return fail('bad_request')
  }
  if (!request.body) return fail('bad_request')

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > expected) {
      await reader.cancel().catch(() => undefined)
      return fail(size > limit ? 'too_large' : 'bad_request')
    }
    chunks.push(value)
  }
  if (size !== expected) return fail('bad_request')

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return ok(bytes)
}

/** The exact byte string an op's Ed25519 signature covers. */
export const signedMessage = (
  op: BuddiesSigningOp,
  payloadBytes: Uint8Array
): Uint8Array => {
  const prefix = encoder.encode(`${SIGNING_CONTEXT}${op}\n`)
  const message = new Uint8Array(prefix.byteLength + payloadBytes.byteLength)
  message.set(prefix, 0)
  message.set(payloadBytes, prefix.byteLength)
  return message
}

/**
 * Verifies an Ed25519 signature over `message` with WebCrypto against a `b64u`
 * public key. Any malformed key or signature is simply "not valid".
 */
export const verifyEd25519 = async (
  publicKey: string,
  message: Uint8Array,
  signature: Uint8Array
): Promise<boolean> => {
  const raw = decodeB64u(publicKey)
  if (!raw || raw.byteLength !== 32 || signature.byteLength !== 64) return false
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'Ed25519' },
      false,
      ['verify']
    )
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      signature,
      message
    )
  } catch {
    return false
  }
}

/** Verifies a signed op against a stored `b64u` public key. */
export const verifyBuddiesSignature = (
  publicKey: string,
  op: BuddiesSigningOp,
  payloadBytes: Uint8Array,
  signature: Uint8Array
): Promise<boolean> =>
  verifyEd25519(publicKey, signedMessage(op, payloadBytes), signature)
