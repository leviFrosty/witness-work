#!/usr/bin/env node
/**
 * Buddies relay protocol fuzzer against a running worker.
 *
 *   pnpm fuzz:buddies [--runs 300] [--seed <uint32>] [--case <i>] [--url <base>] [--timeout-ms 5000]
 *
 * The seed fixes which mutation each case applies and its parameters; ids,
 * keys, and nonces are fresh every run so a seed can be replayed against the
 * same persisted state. Oracle per request: never 5xx, never slower than the
 * timeout, buddies errors are `{error}` JSON, and each mutation's documented
 * status (e.g. tampered signature -> 401). After all cases a canary identity's
 * full `inbox/sync` must equal its pre-fuzz snapshot. Writes a JSON report to
 * .verify/artifacts/fuzz-<timestamp>.json and exits 1 on any failure.
 *
 * Both ways to authenticate are fuzzed: legacy requests (signed envelopes, no
 * `Authorization` header) and bearer requests on account sessions opened
 * with the dev bypass (`WW_API_DEV_BYPASS_TOKEN`, else the token
 * `dev.mjs up` recorded). A second canary, registered and synced by bearer
 * request, must come through intact too. Without a bypass token the bearer
 * generators are skipped (and counted as such). Tokens never reach the report.
 */

import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ALL_OPS,
  ENVELOPE_HEADERS,
  OWNER_OPS,
  SIGNED_OPS,
  WIRE_EDGE_LIMITS,
  WIRE_LIMITS as L,
  accountEnvelope,
  b64u,
  fieldsHeader,
  fromB64u,
  inboxLinkMessage,
  sha256,
  signedEnvelope,
  signingKeyFromSeed,
  unsignedEnvelope,
} from './buddies-wire.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ARTIFACTS = join(ROOT, '.verify', 'artifacts')

// --- CLI ------------------------------------------------------------------

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  if (index !== -1 && argv[index + 1] !== undefined) return argv[index + 1]
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`))
  return inline ? inline.split('=')[1] : fallback
}
const readState = () => {
  const path = join(ROOT, '.verify', 'state.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}
const BASE = String(flag('url', process.env.WW_API_URL ?? readState().url ?? '')).replace(/\/$/, '')
/** Opens account sessions without attestation; bearer generators skip without it. */
const DEV_BYPASS = process.env.WW_API_DEV_BYPASS_TOKEN ?? (process.env.WW_API_URL ? undefined : readState().tokens?.devBypass)
const RUNS = Number(flag('runs', process.env.WW_FUZZ_RUNS ?? 300))
const SEED = Number(flag('seed', process.env.WW_FUZZ_SEED ?? randomBytes(4).readUInt32BE(0))) >>> 0
const ONLY = flag('case', undefined)
const TIMEOUT_MS = Number(flag('timeout-ms', 5_000))
if (!BASE) {
  console.error('fuzz: no worker URL; run `node scripts/verify/dev.mjs up` or pass --url / WW_API_URL')
  process.exit(2)
}
if (!Number.isInteger(RUNS) || RUNS < 1) {
  console.error('fuzz: --runs must be a positive integer')
  process.exit(2)
}
// Legacy requests are half of what's fuzzed. The local worker's AUTH_LEGACY
// ([env.dev.vars], as Beta's) is off (ADR 0038 §11), so turn them on in the
// local launcher's KV; a deployed worker is left as it is.
if (!process.env.WW_API_URL && !argv.some((arg) => arg.startsWith('--url')) && existsSync(join(ROOT, '.verify', 'state.json'))) {
  const seeded = spawnSync(process.execPath, [join(ROOT, 'scripts/verify/dev.mjs'), 'kv', 'put', 'auth:legacy', 'on'], { cwd: ROOT, encoding: 'utf8' })
  if (seeded.status !== 0) {
    console.error(`fuzz: couldn't turn legacy auth on in local KV: ${seeded.stderr}`)
    process.exit(2)
  }
}

// --- Seeded shape randomness (mulberry32), fresh entropy for ids/keys -----

const hash32 = (text) => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const makeRng = (seed) => {
  const next = mulberry32(seed)
  const rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    bool: () => next() < 0.5,
  }
  return rng
}

const rid = () => b64u(randomBytes(16))
const blob = (bytes) => b64u(randomBytes(bytes))
const newKey = () => signingKeyFromSeed(randomBytes(32))
let ipCounter = randomBytes(2).readUInt16BE(0)
const nextIp = () => {
  ipCounter = (ipCounter + 1) % 65_536
  return `198.19.${ipCounter >> 8}.${ipCounter & 255}`
}

// --- HTTP with oracle ---------------------------------------------------------

class FuzzFailure extends Error {
  constructor(reason, exchange) {
    super(reason)
    this.exchange = exchange
  }
}

const stats = {
  requests: 0,
  sessionsOpened: 0,
  devProxyRetries: 0,
  statuses: {},
  latencies: [],
  byGenerator: {},
}

let caseLog = []
const DEV_PROXY_503 = 'Your worker restarted mid-request.'

const describeBody = (body) => {
  if (body == null) return undefined
  if (typeof body === 'string') return body
  if (body instanceof Uint8Array) return `<${body.length} raw bytes, sha256 ${createHash('sha256').update(body).digest('hex').slice(0, 16)}>`
  return '<stream>'
}

/** Tokens (bearer, dev bypass) are recorded by name only. */
const SECRET_HEADERS = new Set(['authorization', 'x-ww-dev-bypass'])
const redact = (headers) =>
  Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, SECRET_HEADERS.has(name.toLowerCase()) ? '<redacted>' : value]))

const clip = (text, max) =>
  text && text.length > max
    ? `${text.slice(0, max)}…<${text.length} chars, sha256 ${createHash('sha256').update(text).digest('hex').slice(0, 16)}>`
    : text

/**
 * Sends one request. `expect` is a status list (or predicate); `error` the
 * expected buddies error code. Global invariants apply to every request.
 */
const send = async ({ op, path, method = 'POST', body, headers = {}, expect, error, note, raw = false }) => {
  const url = `${BASE}${path ?? `/buddies/v1/${op}`}`
  const finalHeaders = { 'cf-connecting-ip': nextIp(), ...headers }
  let payload = body
  if (body && typeof body === 'object' && !(body instanceof Uint8Array) && !(body instanceof ReadableStream)) {
    payload = JSON.stringify(body)
    finalHeaders['content-type'] ??= 'application/json'
  }
  const exchange = {
    note,
    request: { method, url: url.slice(BASE.length), headers: redact(finalHeaders), body: describeBody(payload) },
  }
  caseLog.push(exchange)
  const started = performance.now()
  let response
  let text
  let bytes
  const read = async () => {
    bytes = new Uint8Array(await response.arrayBuffer())
    text = new TextDecoder().decode(bytes)
  }
  try {
    response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: payload,
      duplex: payload instanceof ReadableStream ? 'half' : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    await read()
    // `wrangler dev` only: after the worker cancels a chunked upload (the
    // oversized-envelope case), wrangler's local ProxyWorker answers the next
    // non-GET request with this canned 503 instead of forwarding it. It never
    // reaches the worker and doesn't exist in production, so retry once (only
    // when the body can be resent) and count it in the report.
    if (response.status === 503 && text.startsWith(DEV_PROXY_503) && !(payload instanceof ReadableStream)) {
      stats.devProxyRetries++
      exchange.devProxyRetry = true
      response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: payload,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      await read()
    }
  } catch (cause) {
    const ms = Math.round(performance.now() - started)
    exchange.response = { error: String(cause?.name ?? cause), ms }
    throw new FuzzFailure(
      cause?.name === 'TimeoutError' ? `hang: no response within ${TIMEOUT_MS}ms` : `transport error: ${cause?.message}`,
      exchange
    )
  }
  const ms = Math.round(performance.now() - started)
  stats.requests++
  stats.statuses[response.status] = (stats.statuses[response.status] ?? 0) + 1
  stats.latencies.push(ms)
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // checked below
  }
  // `raw` answers (blob/get) are bytes on 200: record their size, not the bytes.
  const binary = raw && response.status === 200
  exchange.response = { status: response.status, body: binary ? describeBody(bytes) : clip(text, 2_000), ms }

  if (response.status >= 500 && !(response.status === 503 && json?.error === 'disabled')) {
    throw new FuzzFailure(`server error ${response.status}`, exchange)
  }
  if (ms > TIMEOUT_MS) throw new FuzzFailure(`slow: ${ms}ms > ${TIMEOUT_MS}ms`, exchange)
  if (url.includes('/buddies/v1/') && response.status !== 404 && !json && !binary) {
    throw new FuzzFailure('non-JSON buddies response', exchange)
  }
  if (response.status >= 400 && json && typeof json.error !== 'string') {
    throw new FuzzFailure('error response without an error code', exchange)
  }
  const allowed = typeof expect === 'function' ? expect(response.status, json) : expect ? expect.includes(response.status) : true
  if (!allowed) {
    throw new FuzzFailure(`expected status ${Array.isArray(expect) ? expect.join('|') : 'predicate'}, got ${response.status}`, exchange)
  }
  if (error && json?.error !== error) {
    throw new FuzzFailure(`expected error "${error}", got ${JSON.stringify(json)}`, exchange)
  }
  return { status: response.status, json, text, bytes, headers: response.headers }
}

const signed = async (op, key, payload) =>
  signedEnvelope(op, { ts: Date.now(), nonce: rid(), ...payload }, key)

// --- Identities ---------------------------------------------------------------

const newOwner = async () => {
  const key = await newKey()
  const owner = { key, inboxId: rid() }
  owner.send = async (op, payload, expect = [200], error) =>
    send({ op, body: await signed(op, key, { inboxId: owner.inboxId, ...payload }), expect, error })
  await owner.send('inbox/register', { ownerPub: key.publicKey })
  return owner
}

const newWriter = async (owner) => {
  const key = await newKey()
  const writer = { key, inboxId: owner.inboxId, slotId: rid() }
  await owner.send('slot/add', { slotId: writer.slotId, writerPub: key.publicKey })
  writer.send = async (op, payload, expect = [200], error) =>
    send({
      op,
      body: await signed(op, key, { inboxId: writer.inboxId, slotId: writer.slotId, ...payload }),
      expect,
      error,
    })
  return writer
}

const inviteSecrets = async () => {
  const claimSecret = randomBytes(32)
  return {
    inviteId: rid(),
    claimSecret: b64u(claimSecret),
    claimVerifier: b64u(await sha256(claimSecret)),
  }
}

const TEMPLATES = { 'plan.joined': { title: 'Plans', body: 'A buddy is coming' } }

/** A valid payload (minus ts/nonce) for `op` against an identity + slot. */
const validPayload = async (op, ctx) => {
  const { owner, writer } = ctx
  const base = { inboxId: owner.inboxId }
  switch (op) {
    case 'inbox/register':
      return { ...base, ownerPub: owner.key.publicKey }
    case 'inbox/sync':
      return { ...base, since: 0 }
    case 'inbox/delete':
      return base
    case 'device/register':
      return { ...base, deviceId: rid(), pushService: 'apns', apnsToken: randomBytes(32).toString('hex'), apnsEnvironment: 'sandbox', apnsTopic: 'com.leviwilkerson.jwtimedev', templates: TEMPLATES }
    case 'device/unregister':
      return { ...base, deviceId: rid() }
    case 'slot/add':
      return { ...base, slotId: rid(), writerPub: (await newKey()).publicKey }
    case 'slot/remove':
      return { ...base, slotId: rid() }
    case 'roster/put':
      return { ...base, blob: blob(64) }
    case 'invite/create': {
      const secrets = await inviteSecrets()
      return { ...base, inviteId: secrets.inviteId, claimVerifier: secrets.claimVerifier, blob: blob(64), expiresAt: Date.now() + 3_600_000 }
    }
    case 'invite/delete':
      return { ...base, inviteId: rid() }
    case 'blob/delete':
      return { ...base, blobIds: [b64u(randomBytes(32))] }
    case 'card/put':
      return { ...base, slotId: writer.slotId, blob: blob(64) }
    case 'event/put':
      return { ...base, slotId: writer.slotId, eventId: rid(), kind: 'plan.joined', blob: blob(48), push: false }
    case 'slot/leave':
    case 'slot/seal':
      return { ...base, slotId: writer.slotId }
    case 'invite/fetch':
      return { inviteId: rid() }
    case 'invite/claim':
      return { inviteId: rid(), claimSecret: b64u(randomBytes(32)), blob: blob(32) }
  }
  throw new Error(`no payload for ${op}`)
}

const WRITER_OPS = new Set(['card/put', 'event/put', 'slot/leave', 'slot/seal'])
/** Valid payload fields the contract lets a client leave out. */
const OPTIONAL_FIELDS = new Set(['pushService', 'apnsTopic'])
const keyFor = (op, ctx) => (WRITER_OPS.has(op) ? ctx.writer.key : ctx.owner.key)
/** Ops whose valid form changes canary data; mutations must not land there. */
const CANARY_TARGET_OPS = SIGNED_OPS.filter((op) => op !== 'inbox/register')

// --- Invalid value pools (each is invalid for its field) -------------------

const ID_POOL = [null, 123, '', 'short', `${'A'.repeat(21)}!`, 'A'.repeat(23), '😀'.repeat(11), 'Ａ'.repeat(22), [], {}, true, 'A'.repeat(21) + '\u0000', 'x'.repeat(100_000)]
const INVALID = {
  inboxId: ID_POOL,
  slotId: ID_POOL,
  inviteId: ID_POOL,
  deviceId: ID_POOL,
  eventId: ID_POOL,
  nonce: ID_POOL,
  ts: ['1700000000000', null, 1e300, [], true, {}, 2 ** 53],
  since: [-1, 1.5, '0', null, 2 ** 53, true, {}],
  ownerPub: ['', 'A'.repeat(42), 'A'.repeat(44), b64u(randomBytes(31)), b64u(randomBytes(33)), null, 7, '+/+/'.repeat(11)],
  writerPub: ['', 'A'.repeat(42), b64u(randomBytes(31)), null, 7],
  claimVerifier: ['', b64u(randomBytes(31)), b64u(randomBytes(33)), null, 1],
  blob: ['', 'not base64!', 'A', 'AAAAA', null, 5, 'ü'.repeat(10), [], 'AAAA='],
  kind: ['', 'Upper', '1abc', 'a'.repeat(41), 'a b', 'émoji', null, 3, 'a-b', '.a'],
  push: ['true', 1, null, 0, [], {}],
  expiresAt: [() => Date.now() - 1, () => Date.now() + L.maxInviteLifetimeMs + 120_000, '123', 1.5, null, -5],
  apnsToken: ['', 'xyz', 'zz'.repeat(32), 'ab'.repeat(15), 'ab'.repeat(129), null, 42],
  apnsEnvironment: ['dev', '', null, 'SANDBOX', 1],
  // 'fcm' is invalid here too: the payload carries no fcmToken.
  pushService: ['fcm', 'gcm', 'APNS', '', null, 1],
  // Unknown topics pass the shape check and are refused by the inbox.
  apnsTopic: ['', 'nodots', 'com.example.other', 'a/b.c', null, 1, 'a.'.repeat(80)],
  templates: [
    null,
    [],
    'x',
    { 'Bad Kind': { title: 'a', body: 'b' } },
    { a: { title: 'x'.repeat(L.templateChars + 1), body: '' } },
    { a: { title: 1, body: 'b' } },
    { a: null },
    Object.fromEntries(Array.from({ length: L.templates + 1 }, (_, i) => [`k${i}`, { title: 't', body: 'b' }])),
  ],
  claimSecret: [b64u(randomBytes(31)), '', null, 'not b64!', b64u(randomBytes(33))],
  blobIds: [
    [],
    'x',
    null,
    ['x'],
    [b64u(randomBytes(31))],
    [b64u(randomBytes(33))],
    Array.from({ length: L.blobDeleteIds + 1 }, () => b64u(randomBytes(32))),
  ],
}

// --- Photo blobs ------------------------------------------------------------------

/** Sealed-looking bytes, their id, and a read token, as the app makes them. */
const photo = async (size) => {
  const bytes = new Uint8Array(randomBytes(size))
  const token = randomBytes(32)
  return { bytes, blobId: b64u(await sha256(bytes)), token: b64u(token), readTokenHash: b64u(await sha256(token)) }
}

/** `blob/put`: the signed envelope in headers, `body` (default the photo's bytes) raw. */
const putBlob = async (owner, blob, { fields = {}, body = blob.bytes, key = owner.key, expect = [200], error, note } = {}) => {
  const envelope = await signedEnvelope(
    'blob/put',
    { inboxId: owner.inboxId, blobId: blob.blobId, bytes: blob.bytes.length, expiresAt: Date.now() + 86_400_000, readTokenHash: blob.readTokenHash, ts: Date.now(), nonce: rid(), ...fields },
    key
  )
  return send({
    op: 'blob/put',
    body,
    headers: { 'content-type': 'application/octet-stream', [ENVELOPE_HEADERS.payload]: envelope.payload, [ENVELOPE_HEADERS.signature]: envelope.signature },
    expect,
    error,
    note: note ?? `blob/put ${body.length} bytes`,
  })
}

const getBlob = (inboxId, blob, token = blob.token, expect = [200], error) =>
  send({ op: 'blob/get', body: unsignedEnvelope({ inboxId, blobId: blob.blobId, token }), raw: true, expect, error, note: 'blob/get' })

const sameBytes = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i])

// --- Account sessions (bearer requests) -----------------------------------------

/** A generator's answer when it can't run here (no dev bypass token). */
const SKIPPED = Symbol('skipped')
/** Access tokens last 15 minutes; reopen well before that. */
const SESSION_REFRESH_MS = 10 * 60_000

/** Opens a session for `key` (a fresh one by default) with the dev bypass. */
const openSession = async (key) => {
  const signingKey = key ?? (await newKey())
  const response = await send({
    path: '/accounts/v1/sessions',
    body: await accountEnvelope('session/open', signingKey),
    headers: { 'x-ww-dev-bypass': DEV_BYPASS },
    expect: [201],
    note: 'open a session (dev bypass)',
  })
  stats.sessionsOpened++
  const { accountId, accessToken, refreshToken } = response.json
  return {
    key: signingKey,
    accountId,
    accessToken,
    refreshToken,
    openedAt: Date.now(),
    auth: { authorization: `Bearer ${accessToken}` },
  }
}

/** Reopens a long-lived session (same key, so the same account) before its token expires. */
const keepFresh = async (session) => {
  if (Date.now() - session.openedAt < SESSION_REFRESH_MS) return
  Object.assign(session, await openSession(session.key))
}

const linkProof = async (account, inboxId, ownerPub) => ({
  accountId: account.accountId,
  signature: b64u(await account.key.sign(inboxLinkMessage(account.accountId, inboxId, ownerPub))),
})

/**
 * An inbox on a session: registered by bearer request (token plus the
 * self-signed envelope with its `account` proof), owner ops sent as plain JSON.
 */
const newBearerOwner = async (session) => {
  const account = session ?? (await openSession())
  const key = await newKey()
  const owner = { key, inboxId: rid(), account }
  owner.register = async (fields = {}, expect = [200], error, headers = account.auth, note) =>
    send({
      op: 'inbox/register',
      body: await signed('inbox/register', key, {
        inboxId: owner.inboxId,
        ownerPub: key.publicKey,
        account: await linkProof(account, owner.inboxId, key.publicKey),
        ...fields,
      }),
      headers,
      expect,
      error,
      note: note ?? 'bearer inbox/register',
    })
  owner.send = (op, fields = {}, expect = [200], error, headers = account.auth, note) =>
    send({ op, body: { inboxId: owner.inboxId, ...fields }, headers, expect, error, note: note ?? `bearer ${op}` })
  await owner.register()
  return owner
}

/** `blob/put` as a bearer request: the fields in `x-buddies-payload`, no signature. */
const putBlobBearer = (owner, blob, { fields = {}, body = blob.bytes, headers = owner.account.auth, expect = [200], error, note } = {}) =>
  send({
    op: 'blob/put',
    body,
    headers: {
      'content-type': 'application/octet-stream',
      [ENVELOPE_HEADERS.payload]: fieldsHeader({
        inboxId: owner.inboxId,
        blobId: blob.blobId,
        bytes: blob.bytes.length,
        expiresAt: Date.now() + 86_400_000,
        readTokenHash: blob.readTokenHash,
        ...fields,
      }),
      ...headers,
    },
    expect,
    error,
    note: note ?? `bearer blob/put ${body.length} bytes`,
  })

/** A writer op as a bearer request: the writer-signed envelope plus a token. */
const sendWriterBearer = async (writer, op, fields, headers, { key = writer.key, expect = [200], error, note } = {}) =>
  send({
    op,
    body: await signed(op, key, { inboxId: writer.inboxId, slotId: writer.slotId, ...fields }),
    headers,
    expect,
    error,
    note: note ?? `bearer ${op}`,
  })

/** Fields a bearer request ignores (it has no signature to bind them). */
const BEARER_IGNORED = new Set(['ts', 'nonce'])

// --- Generators -----------------------------------------------------------------
// Each receives (rng, canary) and throws FuzzFailure on an oracle violation.

const flipBit = (bytes, rng) => {
  const copy = new Uint8Array(bytes)
  const bit = rng.int(0, copy.length * 8 - 1)
  copy[bit >> 3] ^= 1 << (bit & 7)
  return copy
}

const GENERATORS = {
  /** Valid payload for the canary, signature bit-flipped (decoded, re-encoded). */
  'tampered-signature': async (rng, canary) => {
    const op = rng.pick(CANARY_TARGET_OPS)
    const env = await signed(op, keyFor(op, canary), await validPayload(op, canary))
    env.signature = b64u(flipBit(fromB64u(env.signature), rng))
    await send({ op, body: env, expect: [401], error: 'bad_signature', note: `bit-flipped signature on ${op}` })
  },

  /** Signed payload, then a different payload sent under the same signature. */
  'tampered-payload': async (rng, canary) => {
    const op = rng.pick(['inbox/sync', 'roster/put', 'card/put', 'inbox/delete', 'slot/leave'])
    const payload = { ts: Date.now(), nonce: rid(), ...(await validPayload(op, canary)) }
    const env = await signedEnvelope(op, payload, keyFor(op, canary))
    const forged = { ...payload, nonce: rid() }
    if ('since' in forged) forged.since = rng.int(1, 1_000)
    if ('blob' in forged) forged.blob = blob(64)
    env.payload = b64u(new TextEncoder().encode(JSON.stringify(forged)))
    await send({ op, body: env, expect: [401], error: 'bad_signature', note: `payload swapped under ${op} signature` })
  },

  /** Correct shape, signed by an unrelated key / the wrong role's key. */
  'wrong-key': async (rng, canary) => {
    const op = rng.pick(CANARY_TARGET_OPS)
    const variant = rng.pick(['stranger', 'swap-role'])
    const key =
      variant === 'stranger' ? await newKey() : WRITER_OPS.has(op) ? canary.owner.key : canary.writer.key
    await send({
      op,
      body: await signed(op, key, await validPayload(op, canary)),
      expect: [401],
      error: 'bad_signature',
      note: `${variant} key on ${op}`,
    })
  },

  /** A signature for one op replayed against another op's path. */
  'cross-op-signature': async (rng, canary) => {
    const signedAs = rng.pick(['inbox/sync', 'inbox/delete', 'slot/remove', 'device/unregister'])
    const sentTo = rng.pick(['inbox/delete', 'inbox/sync', 'slot/remove', 'roster/put', 'slot/leave'].filter((op) => op !== signedAs))
    const payload = { ...(await validPayload(signedAs, canary)), ...(await validPayload(sentTo, canary)) }
    const env = await signed(signedAs, keyFor(signedAs, canary), payload)
    await send({ op: sentTo, body: env, expect: [401], error: 'bad_signature', note: `signed as ${signedAs}, sent to ${sentTo}` })
  },

  /** Exact envelope resent, sequentially and in parallel: one 200, rest `replay`. */
  'replay': async (rng) => {
    const owner = await newOwner()
    const op = rng.pick(['inbox/sync', 'roster/put', 'device/unregister'])
    const env = await signed(op, owner.key, await validPayload(op, { owner }))
    const copies = rng.int(1, 8)
    if (rng.bool()) {
      await send({ op, body: env, expect: [200], note: 'original' })
      for (let i = 0; i < copies; i++) await send({ op, body: env, expect: [409], error: 'replay', note: `sequential replay ${i + 1}` })
    } else {
      const results = await Promise.all(
        Array.from({ length: copies + 1 }, (_, i) => send({ op, body: env, expect: [200, 409], note: `parallel copy ${i}` }))
      )
      const wins = results.filter((r) => r.status === 200).length
      if (wins !== 1) throw new FuzzFailure(`parallel replay: ${wins} of ${copies + 1} copies accepted (want exactly 1)`, caseLog.at(-1))
    }
  },

  /** Correctly signed but outside the ±5 min window. */
  'stale-timestamp': async (rng, canary) => {
    const op = rng.pick(CANARY_TARGET_OPS)
    const skew = L.timestampSkewMs + rng.int(1_000, 30 * 86_400_000)
    const ts = rng.pick([Date.now() - skew, Date.now() + skew, 0, -1, Number.MAX_SAFE_INTEGER])
    await send({
      op,
      body: await signed(op, keyFor(op, canary), { ...(await validPayload(op, canary)), ts }),
      expect: [401],
      error: 'stale',
      note: `ts=${ts}`,
    })
  },

  /** One field replaced by a value that is invalid for it. */
  'wrong-type': async (rng, canary) => {
    const op = rng.pick(CANARY_TARGET_OPS)
    const payload = { ts: Date.now(), nonce: rid(), ...(await validPayload(op, canary)) }
    const fields = Object.keys(payload).filter((name) => INVALID[name])
    const field = rng.pick(fields)
    let value = rng.pick(INVALID[field])
    if (typeof value === 'function') value = value()
    payload[field] = value
    await send({
      op,
      body: await signedEnvelope(op, payload, keyFor(op, canary)),
      expect: [400],
      error: 'bad_request',
      note: `${op}.${field} = ${clip(JSON.stringify(value) ?? String(value), 80)}`,
    })
  },

  /** One required field removed. */
  'missing-field': async (rng, canary) => {
    const op = rng.pick([...SIGNED_OPS, 'invite/fetch', 'invite/claim'])
    const payload = await validPayload(op, canary)
    const signedOp = SIGNED_OPS.includes(op)
    const full = signedOp ? { ts: Date.now(), nonce: rid(), ...payload } : payload
    const field = rng.pick(Object.keys(full).filter((name) => !OPTIONAL_FIELDS.has(name)))
    delete full[field]
    await send({
      op,
      body: signedOp ? await signedEnvelope(op, full, keyFor(op, canary)) : unsignedEnvelope(full),
      expect: [400],
      error: 'bad_request',
      note: `${op} without ${field}`,
    })
  },

  /** Envelope-level garbage: bad JSON, wrong shapes, bad base64, bad UTF-8. */
  'malformed-envelope': async (rng, canary) => {
    const op = rng.pick(ALL_OPS)
    const goodPayload = (await signed('inbox/sync', canary.owner.key, await validPayload('inbox/sync', canary))).payload
    const cases = [
      ['raw', '{not json'],
      ['raw', ''],
      ['raw', 'null'],
      ['raw', '[]'],
      ['raw', '42'],
      ['raw', '"payload"'],
      ['raw', '{"payload":'],
      ['raw', '{"p":'],
      ['raw', '['.repeat(5_000) + ']'.repeat(5_000)],
      ['raw', `{"payload":"${'A'.repeat(100)}"${',"x":1'.repeat(2_000)}}`],
      ['json', { payload: 1 }],
      ['json', { payload: '' }],
      ['json', { payload: null, signature: 'x' }],
      ['json', { p: '' }],
      ['json', { p: null, s: 'x' }],
      ['json', { payload: 'not base64!' }],
      ['json', { payload: 'A' }],
      ['json', { payload: `${goodPayload}==` }],
      ['json', { p: `${goodPayload}==` }],
      ['json', { payload: b64u(Buffer.from('not json')) }],
      ['json', { payload: b64u(Buffer.from('[1,2]')) }],
      ['json', { payload: b64u(Buffer.from('"str"')) }],
      ['json', { payload: b64u(Buffer.from([0xff, 0xfe, 0x7b, 0x7d])) }],
      ['json', { payload: b64u(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])) }],
      ['bytes', Uint8Array.from([0xff, 0xfe, 0xfd])],
      ['bom', null],
    ]
    const [kind, value] = rng.pick(cases)
    if (kind === 'bom') {
      // A UTF-8 byte-order mark is ignored (JSON decoding strips it): the
      // signed envelope after it counts.
      const env = await signed('inbox/sync', canary.owner.key, await validPayload('inbox/sync', canary))
      await send({
        op: 'inbox/sync',
        body: new TextEncoder().encode(`\ufeff${JSON.stringify(env)}`),
        headers: { 'content-type': rng.pick(['application/json', 'text/plain', 'application/x-www-form-urlencoded']) },
        expect: [200],
        note: 'byte-order mark before a signed inbox/sync envelope',
      })
      return
    }
    await send({
      op,
      body: value,
      headers: kind === 'json' ? {} : { 'content-type': rng.pick(['application/json', 'text/plain', 'application/x-www-form-urlencoded']) },
      expect: [400],
      error: 'bad_request',
      note: `${kind} envelope on ${op}: ${clip(describeBody(typeof value === 'object' && !(value instanceof Uint8Array) ? JSON.stringify(value) : value), 80)}`,
    })
  },

  /** Valid payload, malformed `signature` (missing, wrong type, wrong length, bad alphabet). */
  'malformed-signature': async (rng, canary) => {
    const op = rng.pick(CANARY_TARGET_OPS)
    const env = await signed(op, keyFor(op, canary), await validPayload(op, canary))
    const signature = rng.pick([undefined, null, 7, '', env.signature.slice(1), `${env.signature}A`, `${env.signature.slice(0, 85)}!`, `${env.signature.slice(0, 84)}==`, 'A'.repeat(86), {}])
    await send({ op, body: { payload: env.payload, signature }, expect: [401], error: 'bad_signature', note: `signature=${clip(JSON.stringify(signature) ?? 'undefined', 40)}` })
  },

  /** Blobs at the decoded-size limit succeed; one byte over is rejected. */
  'blob-boundaries': async (rng) => {
    const owner = await newOwner()
    const target = rng.pick(['roster', 'card', 'event', 'invite', 'claim'])
    const over = rng.bool()
    const status = over ? [400] : [200]
    const error = over ? 'bad_request' : undefined
    const size = (limit) => limit + (over ? 1 : 0)
    if (target === 'roster') {
      await owner.send('roster/put', { blob: blob(size(L.rosterBytes)) }, status, error)
    } else if (target === 'card' || target === 'event') {
      const writer = await newWriter(owner)
      if (target === 'card') await writer.send('card/put', { blob: blob(size(L.cardBytes)) }, status, error)
      else await writer.send('event/put', { eventId: rid(), kind: 'plan.joined', blob: blob(size(L.eventBytes)), push: false }, status, error)
    } else if (target === 'invite') {
      const secrets = await inviteSecrets()
      await owner.send(
        'invite/create',
        { inviteId: secrets.inviteId, claimVerifier: secrets.claimVerifier, blob: blob(size(L.inviteBytes)), expiresAt: Date.now() + 60_000 },
        status,
        error
      )
    } else {
      const secrets = await inviteSecrets()
      await owner.send('invite/create', { inviteId: secrets.inviteId, claimVerifier: secrets.claimVerifier, blob: blob(32), expiresAt: Date.now() + 60_000 })
      await send({
        op: 'invite/claim',
        body: unsignedEnvelope({ inviteId: secrets.inviteId, claimSecret: secrets.claimSecret, blob: blob(size(L.claimBytes)) }),
        expect: status,
        error,
        note: `claim blob ${size(L.claimBytes)} bytes`,
      })
    }
  },

  /** Whole envelopes past the 256 KiB ceiling, declared and streamed. */
  'oversized-envelope': async (rng, canary) => {
    const op = rng.pick(ALL_OPS)
    const bytes = L.requestBytes + rng.int(1, 64 * 1024)
    const filler = `{"payload":"${'A'.repeat(bytes)}"}`
    if (rng.bool()) {
      await send({ op, body: filler, headers: { 'content-type': 'application/json' }, expect: [400], error: 'bad_request', note: `${filler.length}-byte envelope` })
    } else {
      const encoded = new TextEncoder().encode(filler)
      const stream = new ReadableStream({
        start(controller) {
          for (let i = 0; i < encoded.length; i += 16_384) controller.enqueue(encoded.subarray(i, i + 16_384))
          controller.close()
        },
      })
      await send({ op, body: stream, headers: { 'content-type': 'application/json' }, expect: [400], error: 'bad_request', note: `${encoded.length}-byte chunked envelope` })
      // wrangler dev's local proxy breaks the request after a cancelled chunked
      // upload (503 for a body request, an indefinite queue for a GET). Absorb
      // it with a resendable POST so later cases measure the worker, not the proxy.
      await send({ path: '/verify-drain', body: '{}', expect: [404], note: 'drain wrangler-dev proxy after cancelled upload' })
    }
    void canary
  },

  /** Unknown ops, odd paths, wrong methods: always a 4xx. */
  'unknown-route': async (rng) => {
    const path = rng.pick([
      '/buddies/v1/inbox/explode',
      '/buddies/v1/INBOX/SYNC',
      '/buddies/v1/inbox/sync/',
      '/buddies/v1/inbox%2Fsync',
      '/buddies/v1/',
      '/buddies/v2/inbox/sync',
      `/buddies/v1/${'a'.repeat(8_000)}`,
      '/buddies/v1/%F0%9F%98%80',
      '/buddies/v1/invite/fetch%00',
      '/buddies/v1/..%2f..%2fhealth',
    ])
    const method = rng.pick(['POST', 'GET', 'PUT', 'DELETE', 'PATCH'])
    await send({
      path,
      method,
      body: method === 'GET' ? undefined : unsignedEnvelope({ inviteId: rid() }),
      expect: (status) => status >= 400 && status < 500,
      note: `${method} ${clip(path, 60)}`,
    })
    const known = rng.pick(ALL_OPS)
    const wrongMethod = rng.pick(['GET', 'PUT', 'DELETE'])
    await send({ op: known, method: wrongMethod, expect: (s) => s === 404 || s === 405, note: `${wrongMethod} on ${known}` })
  },

  /** Unicode, control chars, lone surrogates, huge strings in ignored and real fields. */
  'unicode-and-huge': async (rng) => {
    const owner = await newOwner()
    const weird = rng.pick([
      '😀👨‍👩‍👧‍👦',
      '‮evil‬',
      '\u0000\u0001\u001f',
      '\ud800',
      '\udfff\ud800',
      'é'.repeat(50_000),
      '￿￾',
      'x'.repeat(150_000),
    ])
    if (rng.bool()) {
      // Unknown fields (including the reserved `attest`) are dropped: still valid.
      await owner.send('inbox/sync', { since: 0, attest: weird, [`k${weird.slice(0, 8)}`]: 'v' }, [200])
    } else {
      const field = rng.pick(['nonce', 'inboxId', 'blob'])
      const payload = { ts: Date.now(), nonce: rid(), inboxId: owner.inboxId, blob: blob(32), [field]: weird }
      await send({ op: 'roster/put', body: await signedEnvelope('roster/put', payload, owner.key), expect: [400], error: 'bad_request', note: `roster/put.${field} weird string` })
    }
  },

  /** Count caps: slots + open invites, open invites, templates/kind limits. */
  'cap-boundaries': async (rng) => {
    const owner = await newOwner()
    const variant = rng.pick(['slots', 'invites', 'templates', 'kind', 'expiry'])
    if (variant === 'slots') {
      for (let i = 0; i < L.slotsPlusOpenInvites; i++) await newWriter(owner)
      await owner.send('slot/add', { slotId: rid(), writerPub: (await newKey()).publicKey }, [429], 'limit')
    } else if (variant === 'invites') {
      const create = async (expect, error) => {
        const secrets = await inviteSecrets()
        await owner.send('invite/create', { inviteId: secrets.inviteId, claimVerifier: secrets.claimVerifier, blob: blob(16), expiresAt: Date.now() + 60_000 }, expect, error)
      }
      for (let i = 0; i < L.openInvites; i++) await create([200])
      await create([429], 'limit')
    } else if (variant === 'templates') {
      const count = rng.bool() ? L.templates : L.templates + 1
      const title = rng.bool() ? '😀'.repeat(L.templateChars) : '😀'.repeat(L.templateChars + 1)
      const ok = count <= L.templates && [...title].length <= L.templateChars
      const templates = Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, { title, body: 'b' }]))
      await owner.send(
        'device/register',
        { deviceId: rid(), apnsToken: randomBytes(32).toString('hex'), apnsEnvironment: 'production', templates },
        ok ? [200] : [400],
        ok ? undefined : 'bad_request'
      )
    } else if (variant === 'kind') {
      const writer = await newWriter(owner)
      const over = rng.bool()
      await writer.send('event/put', { eventId: rid(), kind: 'a'.repeat(L.kindChars + (over ? 1 : 0)), blob: blob(8), push: false }, over ? [400] : [200])
    } else {
      const over = rng.bool()
      const secrets = await inviteSecrets()
      const expiresAt = Date.now() + (over ? L.maxInviteLifetimeMs + 60_000 : L.maxInviteLifetimeMs - 60_000)
      await owner.send('invite/create', { inviteId: secrets.inviteId, claimVerifier: secrets.claimVerifier, blob: blob(16), expiresAt }, over ? [400] : [200])
    }
  },

  /** Five wrong claim secrets burn an invite; then even the right one is not_found. */
  'claim-burn': async (rng) => {
    const owner = await newOwner()
    const secrets = await inviteSecrets()
    await owner.send('invite/create', { inviteId: secrets.inviteId, claimVerifier: secrets.claimVerifier, blob: blob(16), expiresAt: Date.now() + 60_000 })
    const wrong = rng.int(1, 6)
    for (let i = 0; i < wrong; i++) {
      await send({
        op: 'invite/claim',
        body: unsignedEnvelope({ inviteId: secrets.inviteId, claimSecret: b64u(randomBytes(32)), blob: blob(16) }),
        expect: i < 5 ? [401] : [404],
        note: `wrong claim ${i + 1}`,
      })
    }
    const burned = wrong >= 5
    await send({
      op: 'invite/claim',
      body: unsignedEnvelope({ inviteId: secrets.inviteId, claimSecret: secrets.claimSecret, blob: blob(16) }),
      expect: burned ? [404] : [200],
      note: burned ? 'right secret after burn' : 'right secret before burn',
    })
  },

  /**
   * Per-caller edge limits: a fresh caller (an IPv4 address, or rotating
   * addresses in one IPv6 /64) gets `limit` answers, then 429 `rate_limited`
   * with Retry-After. Up to 2 × limit + 1 requests, since the limiter counts
   * in fixed minutes and a boundary may fall mid-burst.
   */
  'caller-limits': async (rng) => {
    const tier = rng.pick(['unsigned', 'register'])
    const limit = WIRE_EDGE_LIMITS[tier]
    const word = () => randomBytes(2).toString('hex')
    const v6 = rng.bool()
    const prefix = `2001:db8:${word()}:${word()}`
    const v4 = `100.${64 + (randomBytes(1)[0] & 63)}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`
    const owner = { key: await newKey(), inboxId: rid() }
    const expected = tier === 'unsigned' ? 404 : 200
    for (let i = 0; i < 2 * limit + 1; i++) {
      const headers = { 'cf-connecting-ip': v6 ? `${prefix}:${word()}:${word()}:${word()}:${word()}` : v4 }
      const request =
        tier === 'unsigned'
          ? { op: 'invite/fetch', body: unsignedEnvelope({ inviteId: rid() }) }
          : { op: 'inbox/register', body: await signed('inbox/register', owner.key, { inboxId: owner.inboxId, ownerPub: owner.key.publicKey }) }
      const response = await send({
        ...request,
        headers,
        expect: i < limit ? [expected] : [expected, 429],
        note: `${tier} request ${i + 1} from ${v6 ? 'one /64' : 'one IPv4'}`,
      })
      if (response.status === 429) {
        if (response.json?.error !== 'rate_limited' || response.headers.get('retry-after') !== '60')
          throw new FuzzFailure('edge refusal without rate_limited + Retry-After: 60', caseLog.at(-1))
        return
      }
    }
    throw new FuzzFailure(`no 429 after ${2 * limit + 1} ${tier} requests from one caller`, caseLog.at(-1))
  },

  /**
   * Photo blobs: the bytes read back exactly, 1 MiB is fine and one byte more
   * is `too_large`, bytes that don't hash to `blobId` or a stranger's
   * signature are refused, every miss (wrong token, unknown blob, deleted
   * blob) is the same 404, and an inbox with no buddies can't store one.
   */
  'photo-blobs': async (rng) => {
    const owner = await newOwner()
    const variant = rng.pick(['roundtrip', 'boundary', 'mismatch', 'signature', 'misses', 'no-buddies'])
    if (variant === 'no-buddies') {
      await putBlob(owner, await photo(64), { expect: [403], error: 'no_buddies', note: 'blob/put from an inbox with no buddies' })
      return
    }
    await newWriter(owner)
    if (variant === 'roundtrip') {
      const blob = await photo(rng.int(1, 256 * 1024))
      await putBlob(owner, blob)
      const got = await getBlob(owner.inboxId, blob)
      if (!sameBytes(got.bytes, blob.bytes)) throw new FuzzFailure('blob/get bytes differ from blob/put', caseLog.at(-1))
      // A retry is idempotent.
      await putBlob(owner, blob, { note: 'blob/put retry' })
    } else if (variant === 'boundary') {
      const over = rng.bool()
      const blob = await photo(L.blobBytes + (over ? 1 : 0))
      await putBlob(owner, blob, { expect: over ? [413] : [200], error: over ? 'too_large' : undefined })
      // wrangler dev's proxy can break the request after an unread upload.
      if (over) await send({ path: '/verify-drain', body: '{}', expect: [404], note: 'drain wrangler-dev proxy after refused upload' })
    } else if (variant === 'mismatch') {
      const blob = await photo(rng.int(1, 4096))
      const body = new Uint8Array(blob.bytes)
      body[rng.int(0, body.length - 1)] ^= 1 << rng.int(0, 7)
      await putBlob(owner, blob, { body, expect: [400], error: 'bad_request', note: 'blob/put with a flipped bit' })
    } else if (variant === 'signature') {
      const blob = await photo(64)
      await putBlob(owner, blob, { key: await newKey(), expect: [401], error: 'bad_signature', note: 'blob/put by a stranger' })
    } else {
      const blob = await photo(64)
      await putBlob(owner, blob)
      const misses = [
        () => getBlob(owner.inboxId, blob, b64u(randomBytes(32)), [404], 'not_found'),
        async () => getBlob(owner.inboxId, await photo(64), undefined, [404], 'not_found'),
        () => getBlob(rid(), blob, blob.token, [404], 'not_found'),
      ]
      const bodies = new Set()
      for (const miss of misses) bodies.add((await miss()).text)
      await owner.send('blob/delete', { blobIds: [blob.blobId] })
      bodies.add((await getBlob(owner.inboxId, blob, blob.token, [404], 'not_found')).text)
      if (bodies.size !== 1) throw new FuzzFailure(`blob/get misses differ: ${[...bodies].join(' | ')}`, caseLog.at(-1))
    }
  },

  /** Concurrent same-eventId writes dedupe to one seq. */
  'parallel-dedupe': async (rng) => {
    const owner = await newOwner()
    const writer = await newWriter(owner)
    const eventId = rid()
    const copies = rng.int(2, 8)
    const results = await Promise.all(
      Array.from({ length: copies }, () => writer.send('event/put', { eventId, kind: 'plan.joined', blob: blob(16), push: false }))
    )
    const seqs = new Set(results.map((r) => r.json?.seq))
    if (seqs.size !== 1) throw new FuzzFailure(`dedupe: ${copies} parallel puts of one eventId produced seqs ${[...seqs].join(',')}`, caseLog.at(-1))
    const sync = await owner.send('inbox/sync', { since: 0 })
    const stored = sync.json.events.filter((event) => event.eventId === eventId)
    if (stored.length !== 1) throw new FuzzFailure(`dedupe: sync shows ${stored.length} copies of the event`, caseLog.at(-1))
  },

  /**
   * `slot/seal` racing the slot's own writes: each write lands (and sync
   * shows it) or is 403 `sealed` (and doesn't); after the seal every write is
   * `sealed`, sealing again is `ok`, the owner sees `sealed: true`, and
   * leaving still works but keeps the events that landed.
   */
  'sealed-slot': async (rng) => {
    const owner = await newOwner()
    const writer = await newWriter(owner)
    const landedOrSealed = (status, json) => status === 200 || (status === 403 && json?.error === 'sealed')
    const writes = Array.from({ length: rng.int(1, 6) }, () => ({ eventId: rid(), kind: 'plan.joined', blob: blob(16), push: false }))
    const [, ...results] = await Promise.all([
      writer.send('slot/seal', {}),
      ...writes.map((fields) => writer.send('event/put', fields, landedOrSealed)),
    ])
    const sync = await owner.send('inbox/sync', { since: 0 })
    const stored = new Set(sync.json.events.map((event) => event.eventId))
    writes.forEach((fields, i) => {
      if (stored.has(fields.eventId) !== (results[i].status === 200))
        throw new FuzzFailure(`seal race: event/put answered ${results[i].status} but sync ${stored.has(fields.eventId) ? 'has' : 'lacks'} it`, caseLog.at(-1))
    })
    if (sync.json.slots[0]?.sealed !== true) throw new FuzzFailure('sealed slot without sealed: true in sync', caseLog.at(-1))
    const op = rng.pick(['card/put', 'event/put'])
    await writer.send(op, (await validPayload(op, { owner, writer })), [403], 'sealed')
    await writer.send('slot/seal', {})
    await writer.send('slot/leave', {})
    const left = await owner.send('inbox/sync', { since: 0 })
    const kept = new Set(left.json.events.map((event) => event.eventId))
    if (left.json.slots.length !== 0 || [...stored].some((id) => !kept.has(id)))
      throw new FuzzFailure('leaving a sealed slot dropped its events (or kept the slot)', caseLog.at(-1))
    await owner.send('inbox/delete')
  },

  // --- Bearer requests (account sessions) ---------------------------------------

  /**
   * A bad `Authorization` header on any route class: always 401 `unauthorized`
   * with the bearer challenge, never a fallback to the envelope (a valid
   * legacy envelope rides along in some cases).
   */
  'bearer-bad-token': async (rng, canary) => {
    const bearer = canary.bearer
    if (!bearer) return SKIPPED
    await keepFresh(bearer.owner.account)
    const token = bearer.owner.account.accessToken
    const [head, claims, signature] = token.split('.')
    const forgedClaims = b64u(Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')), sub: rid() })))
    const flip = signature.at(-2) === 'A' ? 'B' : 'A'
    const [variant, header] = rng.pick([
      ['flipped signature', `Bearer ${head}.${claims}.${signature.slice(0, -2)}${flip}${signature.at(-1)}`],
      ['no signature', `Bearer ${head}.${claims}`],
      ['forged sub', `Bearer ${head}.${forgedClaims}.${signature}`],
      ['alg none', `Bearer ${b64u(Buffer.from('{"alg":"none","typ":"JWT"}'))}.${claims}.`],
      ['refresh token', `Bearer ${bearer.owner.account.refreshToken}`],
      ['basic scheme', `Basic ${token}`],
      ['no scheme', token],
      ['empty bearer', 'Bearer'],
      ['trailing junk', `Bearer ${token} x`],
      ['random', `Bearer ${b64u(randomBytes(rng.int(1, 300)))}`],
    ])
    const target = rng.pick(['owner', 'owner-envelope', 'writer', 'unsigned', 'register', 'blob/get'])
    let request
    if (target === 'owner') {
      const op = rng.pick(OWNER_OPS)
      request = { op, body: await validPayload(op, bearer) }
    } else if (target === 'owner-envelope') {
      const op = rng.pick(OWNER_OPS)
      request = { op, body: await signed(op, bearer.owner.key, await validPayload(op, bearer)) }
    } else if (target === 'writer') {
      const op = rng.pick(['card/put', 'event/put', 'slot/leave', 'slot/seal'])
      request = { op, body: await signed(op, bearer.writer.key, await validPayload(op, bearer)) }
    } else if (target === 'unsigned') {
      const op = rng.pick(['invite/fetch', 'invite/claim'])
      request = { op, body: unsignedEnvelope(await validPayload(op, bearer)) }
    } else if (target === 'register') {
      request = { op: 'inbox/register', body: await signed('inbox/register', bearer.owner.key, await validPayload('inbox/register', bearer)) }
    } else {
      request = { op: 'blob/get', body: unsignedEnvelope({ inboxId: bearer.owner.inboxId, blobId: b64u(randomBytes(32)), token: b64u(randomBytes(32)) }) }
    }
    const response = await send({ ...request, headers: { authorization: header }, expect: [401], error: 'unauthorized', note: `${variant} on ${target} ${request.op}` })
    if (response.headers.get('www-authenticate') !== 'Bearer error="invalid_token"')
      throw new FuzzFailure('unauthorized without WWW-Authenticate: Bearer error="invalid_token"', caseLog.at(-1))
  },

  /** Another account's valid token on the bearer canary: 403 `forbidden`, nothing lands. */
  'bearer-cross-account': async (rng, canary) => {
    const bearer = canary.bearer
    if (!bearer) return SKIPPED
    await keepFresh(bearer.stranger)
    if (rng.pick(['op', 'op', 'op', 'blob']) === 'blob') {
      await putBlobBearer(bearer.owner, await photo(64), { headers: bearer.stranger.auth, expect: [403], error: 'forbidden', note: "bearer blob/put into another account's inbox" })
      return
    }
    const op = rng.pick(OWNER_OPS)
    await bearer.owner.send(op, await validPayload(op, bearer), [403], 'forbidden', bearer.stranger.auth, `bearer ${op} with another account's token`)
  },

  /** A bearer owner op on the legacy canary, which no account owns: 409 `not_linked`. */
  'bearer-not-linked': async (rng, canary) => {
    const bearer = canary.bearer
    if (!bearer) return SKIPPED
    await keepFresh(bearer.stranger)
    const op = rng.pick(OWNER_OPS)
    await send({
      op,
      body: await validPayload(op, canary),
      headers: bearer.stranger.auth,
      expect: [409],
      error: 'not_linked',
      note: `bearer ${op} on an inbox registered before accounts`,
    })
  },

  /**
   * Bearer owner bodies that aren't the op's plain fields: one field invalid
   * or missing, an envelope, or not a JSON object. All 400 on the bearer
   * canary, which must not change.
   */
  'bearer-bad-fields': async (rng, canary) => {
    const bearer = canary.bearer
    if (!bearer) return SKIPPED
    await keepFresh(bearer.owner.account)
    const op = rng.pick(OWNER_OPS)
    const fields = await validPayload(op, bearer)
    const variant = rng.pick(['wrong-type', 'wrong-type', 'missing', 'envelope', 'short-envelope', 'not-object'])
    let body
    let note
    if (variant === 'wrong-type') {
      const field = rng.pick(Object.keys(fields).filter((name) => INVALID[name] && !BEARER_IGNORED.has(name)))
      let value = rng.pick(INVALID[field])
      if (typeof value === 'function') value = value()
      body = { ...fields, [field]: value }
      note = `bearer ${op}.${field} = ${clip(JSON.stringify(value) ?? String(value), 80)}`
    } else if (variant === 'missing') {
      const field = rng.pick(Object.keys(fields).filter((name) => !OPTIONAL_FIELDS.has(name)))
      body = { ...fields }
      delete body[field]
      note = `bearer ${op} without ${field}`
    } else if (variant === 'envelope' || variant === 'short-envelope') {
      const env = await signed(op, bearer.owner.key, fields)
      body = variant === 'envelope' ? { ...fields, ...env } : { p: env.payload, s: env.signature }
      note = `bearer ${op} with a ${variant}`
    } else {
      body = rng.pick(['[]', 'null', '"x"', '42', '{', ''])
      note = `bearer ${op} body ${body || '(empty)'}`
    }
    await send({
      op,
      body,
      headers: { ...bearer.owner.account.auth, ...(typeof body === 'string' ? { 'content-type': 'application/json' } : {}) },
      expect: [400],
      error: 'bad_request',
      note,
    })
  },

  /**
   * A bearer `inbox/register` must carry an `account` proof for the token's
   * own account, signed by that account's key over this inbox.
   */
  'bearer-register-proof': async (rng, canary) => {
    const bearer = canary.bearer
    if (!bearer) return SKIPPED
    await keepFresh(bearer.stranger)
    const owner = await newBearerOwner()
    const { account } = owner
    const variant = rng.pick(['missing', 'other-account', 'unknown-account', 'forged-signature', 'wrong-inbox', 'stranger-token', 'repeat'])
    const proof = {
      missing: () => undefined,
      'other-account': () => linkProof(bearer.stranger, owner.inboxId, owner.key.publicKey),
      'unknown-account': async () => ({ ...(await linkProof(account, owner.inboxId, owner.key.publicKey)), accountId: rid() }),
      'forged-signature': async () => linkProof({ ...account, key: await newKey() }, owner.inboxId, owner.key.publicKey),
      'wrong-inbox': () => linkProof(account, rid(), owner.key.publicKey),
      'stranger-token': () => linkProof(account, owner.inboxId, owner.key.publicKey),
      repeat: () => linkProof(account, owner.inboxId, owner.key.publicKey),
    }[variant]
    const [expect, error] = {
      missing: [[400], 'bad_request'],
      'other-account': [[403], 'forbidden'],
      'unknown-account': [[403], 'forbidden'],
      'forged-signature': [[401], 'bad_signature'],
      'wrong-inbox': [[401], 'bad_signature'],
      'stranger-token': [[403], 'forbidden'],
      repeat: [[200], undefined],
    }[variant]
    const headers = variant === 'stranger-token' ? bearer.stranger.auth : account.auth
    await owner.register({ account: await proof() }, expect, error, headers, `bearer inbox/register: ${variant}`)
    await owner.send('inbox/delete')
  },

  /**
   * Bearer `blob/put`: the fields in `x-buddies-payload` and no signature.
   * A signature header (either naming) or only the short payload header is
   * 400, `ts`/`nonce` are ignored, the bytes must still hash to `blobId`,
   * and the account checks hold.
   */
  'bearer-blob-put': async (rng, canary) => {
    const bearer = canary.bearer
    if (!bearer) return SKIPPED
    await keepFresh(bearer.stranger)
    const variant = rng.pick(['roundtrip', 'signature-header', 'short-signature-header', 'short-payload', 'ignored-ts-nonce', 'flipped-bit', 'stranger', 'not-linked'])
    const blob = await photo(rng.int(1, 64 * 1024))
    if (variant === 'not-linked') {
      const legacy = await newOwner()
      await newWriter(legacy)
      await putBlobBearer({ ...legacy, account: bearer.stranger }, blob, { expect: [409], error: 'not_linked', note: 'bearer blob/put into an inbox registered before accounts' })
      await legacy.send('inbox/delete', {})
      return
    }
    const owner = await newBearerOwner()
    await newWriter(owner)
    const auth = owner.account.auth
    if (variant === 'roundtrip') {
      await putBlobBearer(owner, blob)
      const got = await send({ op: 'blob/get', body: unsignedEnvelope({ inboxId: owner.inboxId, blobId: blob.blobId, token: blob.token }), headers: bearer.stranger.auth, raw: true, expect: [200], note: 'bearer blob/get' })
      if (!sameBytes(got.bytes, blob.bytes)) throw new FuzzFailure('bearer blob/get bytes differ from blob/put', caseLog.at(-1))
      await putBlobBearer(owner, blob, { note: 'bearer blob/put retry (no replay)' })
    } else if (variant === 'signature-header' || variant === 'short-signature-header') {
      const name = variant === 'signature-header' ? ENVELOPE_HEADERS.signature : 'x-buddies-s'
      await putBlobBearer(owner, blob, { headers: { ...auth, [name]: b64u(randomBytes(64)) }, expect: [400], error: 'bad_request', note: `bearer blob/put with ${name}` })
    } else if (variant === 'short-payload') {
      await send({
        op: 'blob/put',
        body: blob.bytes,
        headers: { 'content-type': 'application/octet-stream', 'x-buddies-p': fieldsHeader({ inboxId: owner.inboxId, blobId: blob.blobId, bytes: blob.bytes.length, expiresAt: Date.now() + 86_400_000, readTokenHash: blob.readTokenHash }), ...auth },
        expect: [400],
        error: 'bad_request',
        note: 'bearer blob/put with only x-buddies-p',
      })
    } else if (variant === 'ignored-ts-nonce') {
      await putBlobBearer(owner, blob, { fields: { ts: rng.pick([0, -1, Date.now() - 86_400_000, 'x']), nonce: rng.pick(['', null, rid()]) }, note: 'bearer blob/put with ts/nonce (ignored)' })
    } else if (variant === 'flipped-bit') {
      const body = new Uint8Array(blob.bytes)
      body[rng.int(0, body.length - 1)] ^= 1 << rng.int(0, 7)
      await putBlobBearer(owner, blob, { body, expect: [400], error: 'bad_request', note: 'bearer blob/put with a flipped bit' })
    } else {
      await putBlobBearer(owner, blob, { headers: bearer.stranger.auth, expect: [403], error: 'forbidden', note: "bearer blob/put with another account's token" })
    }
    await owner.send('inbox/delete')
  },

  /**
   * Writer ops in bearer requests: the writer-signed envelope stays the
   * capability whoever's token rides along; a bad writer signature, a stale
   * `ts`, a bad token, or plain JSON fields are refused.
   */
  'bearer-writer': async (rng, canary) => {
    const bearer = canary.bearer
    if (!bearer) return SKIPPED
    await keepFresh(bearer.stranger)
    const owner = await newBearerOwner()
    const writer = await newWriter(owner)
    const op = rng.pick(['card/put', 'event/put', 'slot/leave', 'slot/seal'])
    const fields = await validPayload(op, { owner, writer })
    const variant = rng.pick(['any-session', 'any-session', 'bad-writer-signature', 'stale', 'bad-token', 'plain-json'])
    if (variant === 'any-session') {
      await sendWriterBearer(writer, op, fields, bearer.stranger.auth, { note: `bearer ${op} with an unrelated session` })
    } else if (variant === 'bad-writer-signature') {
      await sendWriterBearer(writer, op, fields, bearer.stranger.auth, { key: await newKey(), expect: [401], error: 'bad_signature', note: `bearer ${op} signed by a stranger` })
    } else if (variant === 'stale') {
      await sendWriterBearer(writer, op, { ...fields, ts: Date.now() - L.timestampSkewMs - rng.int(1_000, 86_400_000) }, bearer.stranger.auth, { expect: [401], error: 'stale', note: `bearer ${op} with a stale ts` })
    } else if (variant === 'bad-token') {
      await sendWriterBearer(writer, op, fields, { authorization: `Bearer ${b64u(randomBytes(40))}` }, { expect: [401], error: 'unauthorized', note: `${op} with a bad token` })
    } else {
      await send({ op, body: fields, headers: bearer.stranger.auth, expect: [400], error: 'bad_request', note: `${op} as plain JSON` })
    }
    await owner.send('inbox/delete')
  },

  /**
   * A bearer round trip: register with a proof, add a slot, a buddy's
   * event/put, sync it back (twice, no replay), delete, then the inbox is gone.
   */
  'bearer-round-trip': async (rng, canary) => {
    const bearer = canary.bearer
    if (!bearer) return SKIPPED
    await keepFresh(bearer.stranger)
    const owner = await newBearerOwner()
    const writer = await newWriter(owner)
    const eventId = rid()
    await sendWriterBearer(writer, 'event/put', { eventId, kind: 'plan.joined', blob: blob(rng.int(1, 512)), push: false }, bearer.stranger.auth)
    for (let i = 0; i < 2; i++) {
      const sync = await owner.send('inbox/sync', { since: 0, ts: 0, nonce: 'same' })
      if (sync.json?.events?.filter((event) => event.eventId === eventId).length !== 1)
        throw new FuzzFailure('bearer sync is missing the buddy event', caseLog.at(-1))
    }
    await owner.send('inbox/delete')
    await owner.send('inbox/sync', { since: 0 }, [404], 'not_found')
  },

  /**
   * Per-account edge limits: one session's unsigned tier, from a fresh
   * address every request, runs out after `limit`; another session from the
   * same address still has its own budget.
   */
  'bearer-caller-limits': async (_rng, canary) => {
    if (!canary.bearer) return SKIPPED
    const limit = WIRE_EDGE_LIMITS.unsigned
    const session = await openSession()
    for (let i = 0; i < 2 * limit + 1; i++) {
      const response = await send({
        op: 'invite/fetch',
        body: unsignedEnvelope({ inviteId: rid() }),
        headers: session.auth,
        expect: i < limit ? [404] : [404, 429],
        note: `bearer invite/fetch ${i + 1} from a new address`,
      })
      if (response.status === 429) {
        if (response.json?.error !== 'rate_limited' || response.headers.get('retry-after') !== '60')
          throw new FuzzFailure('edge refusal without rate_limited + Retry-After: 60', caseLog.at(-1))
        const shared = caseLog.at(-1).request.headers['cf-connecting-ip']
        const other = await openSession()
        await send({ op: 'invite/fetch', body: unsignedEnvelope({ inviteId: rid() }), headers: { ...other.auth, 'cf-connecting-ip': shared }, expect: [404], note: 'another account from the same address' })
        return
      }
    }
    throw new FuzzFailure(`no 429 after ${2 * limit + 1} bearer requests from one account`, caseLog.at(-1))
  },
}

// --- Canary -------------------------------------------------------------------

const setupCanary = async () => {
  const owner = await newOwner()
  const writer = await newWriter(owner)
  await writer.send('card/put', { blob: blob(512) })
  await writer.send('event/put', { eventId: rid(), kind: 'plan.joined', blob: blob(64), push: false })
  await owner.send('roster/put', { blob: blob(256) })
  await owner.send('device/register', { deviceId: rid(), apnsToken: randomBytes(32).toString('hex'), apnsEnvironment: 'sandbox', templates: TEMPLATES })
  const snapshot = (await owner.send('inbox/sync', { since: 0 })).json
  return { owner, writer, snapshot }
}

/**
 * The bearer canary: an inbox registered by bearer request on its own
 * session, with a buddy's card and event (sent with the buddy's token), a
 * roster, and a device; plus a stranger session for cross-account cases.
 */
const setupBearerCanary = async () => {
  const owner = await newBearerOwner()
  const writer = await newWriter(owner)
  const stranger = await openSession()
  await sendWriterBearer(writer, 'card/put', { blob: blob(512) }, stranger.auth)
  await sendWriterBearer(writer, 'event/put', { eventId: rid(), kind: 'plan.joined', blob: blob(64), push: false }, stranger.auth)
  await owner.send('roster/put', { blob: blob(256) })
  await owner.send('device/register', { deviceId: rid(), apnsToken: randomBytes(32).toString('hex'), apnsEnvironment: 'sandbox', templates: TEMPLATES })
  const snapshot = (await owner.send('inbox/sync', { since: 0 })).json
  return { owner, writer, stranger, snapshot }
}

const stable = (value) => JSON.stringify(value)

// --- Main -----------------------------------------------------------------------

const names = Object.keys(GENERATORS)
const offset = hash32(`offset:${SEED}`) % names.length
const indices = ONLY !== undefined ? [Number(ONLY)] : Array.from({ length: RUNS }, (_, i) => i)
const failures = []
const startedAt = new Date()
console.log(`fuzz: ${indices.length} case(s) against ${BASE} with seed ${SEED}`)

const health = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null)
if (!health?.ok) {
  console.error(`fuzz: ${BASE}/health is not ok; start the worker first (node scripts/verify/dev.mjs up)`)
  process.exit(2)
}

caseLog = []
let canary
try {
  canary = await setupCanary()
  canary.bearer = DEV_BYPASS ? await setupBearerCanary() : null
} catch (error) {
  console.error('fuzz: canary setup failed (harness or server bug):', error.message, JSON.stringify(error.exchange ?? {}, null, 2))
  process.exit(1)
}
if (!canary.bearer) console.log('fuzz: no dev bypass token; bearer generators are skipped')

for (const index of indices) {
  const name = names[(index + offset) % names.length]
  const rng = makeRng(hash32(`${SEED}:${index}`))
  caseLog = []
  const bucket = (stats.byGenerator[name] ??= { cases: 0, failures: 0 })
  bucket.cases++
  try {
    if ((await GENERATORS[name](rng, canary)) === SKIPPED) bucket.skipped = (bucket.skipped ?? 0) + 1
  } catch (error) {
    bucket.failures++
    const failure = {
      case: index,
      generator: name,
      reason: error.message,
      failingExchange: error.exchange ?? null,
      transcript: caseLog,
      repro: `pnpm fuzz:buddies --seed ${SEED} --case ${index}`,
    }
    if (!(error instanceof FuzzFailure)) failure.stack = error.stack
    failures.push(failure)
    console.log(`FAIL case ${index} [${name}]: ${error.message}`)
  }
}

// Post-fuzz invariants: canary intact, worker healthy.
caseLog = []
let canaryOk = false
let canaryDetail = null
try {
  const after = await canary.owner.send('inbox/sync', { since: 0 })
  canaryOk = stable(after.json) === stable(canary.snapshot)
  if (!canaryOk) canaryDetail = { before: canary.snapshot, after: after.json }
} catch (error) {
  canaryDetail = { error: error.message, exchange: error.exchange }
}
if (!canaryOk) {
  failures.push({ case: 'canary', generator: 'canary', reason: 'canary inbox changed or became unsyncable', detail: canaryDetail, transcript: caseLog })
  console.log('FAIL canary: inbox state changed or unsyncable after fuzzing')
}
let bearerCanaryOk = null
let bearerCanaryDetail = null
if (canary.bearer) {
  caseLog = []
  try {
    await keepFresh(canary.bearer.owner.account)
    const after = await canary.bearer.owner.send('inbox/sync', { since: 0 })
    bearerCanaryOk = stable(after.json) === stable(canary.bearer.snapshot)
    if (!bearerCanaryOk) bearerCanaryDetail = { before: canary.bearer.snapshot, after: after.json }
  } catch (error) {
    bearerCanaryOk = false
    bearerCanaryDetail = { error: error.message, exchange: error.exchange }
  }
  if (!bearerCanaryOk) {
    failures.push({ case: 'bearer-canary', generator: 'canary', reason: 'bearer canary inbox changed or became unsyncable', detail: bearerCanaryDetail, transcript: caseLog })
    console.log('FAIL bearer canary: inbox state changed or unsyncable after fuzzing')
  }
}
const healthAfter = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then((r) => r.ok).catch(() => false)
if (!healthAfter) failures.push({ case: 'health', generator: 'health', reason: '/health not ok after fuzzing' })
// Clean up the canaries so repeated runs don't accumulate state.
await canary.owner.send('inbox/delete', {}).catch(() => undefined)
if (canary.bearer) await canary.bearer.owner.send('inbox/delete').catch(() => undefined)

const sorted = [...stats.latencies].sort((a, b) => a - b)
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
const report = {
  seed: SEED,
  runs: indices.length,
  only: ONLY ?? null,
  url: BASE,
  startedAt: startedAt.toISOString(),
  durationMs: Date.now() - startedAt.getTime(),
  requests: stats.requests,
  bearer: canary.bearer != null,
  sessionsOpened: stats.sessionsOpened,
  devProxyRetries: stats.devProxyRetries,
  statuses: stats.statuses,
  latencyMs: { p50: pct(50), p95: pct(95), max: sorted.at(-1) ?? 0 },
  generators: stats.byGenerator,
  canary: { intact: canaryOk, detail: canaryDetail },
  bearerCanary: canary.bearer ? { intact: bearerCanaryOk, detail: bearerCanaryDetail } : 'skipped (no dev bypass token)',
  healthAfter,
  failures,
}
mkdirSync(ARTIFACTS, { recursive: true })
const reportPath = join(ARTIFACTS, `fuzz-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

console.log(
  `fuzz: ${indices.length} cases, ${stats.requests} requests, statuses ${JSON.stringify(stats.statuses)}, p95 ${pct(95)}ms, max ${report.latencyMs.max}ms, wrangler-dev proxy retries ${stats.devProxyRetries}`
)
console.log(
  `fuzz: canary ${canaryOk ? 'intact' : 'BROKEN'}, bearer canary ${canary.bearer ? (bearerCanaryOk ? 'intact' : 'BROKEN') : 'skipped'}, ${stats.sessionsOpened} sessions, health after ${healthAfter ? 'ok' : 'FAILED'}`
)
console.log(`fuzz: report ${reportPath}`)
if (failures.length) {
  console.log(`fuzz: ${failures.length} failure(s); seed ${SEED}. First repro:`)
  const first = failures[0]
  console.log(`  ${first.repro ?? '(post-run invariant)'}`)
  if (first.failingExchange) console.log(JSON.stringify(first.failingExchange, (k, v) => (typeof v === 'string' ? clip(v, 500) : v), 2))
  process.exit(1)
}
console.log('fuzz: ok')
