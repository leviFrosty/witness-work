import { spawnSync } from 'node:child_process'
import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Socket } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BuddiesSignedOp } from '../buddies/contracts'
import { accountSignedMessage, inboxLinkMessage } from '../accounts/contracts'
import {
  SigningKey,
  b64u,
  blobPutHeaders,
  envelope,
  liveHeaders,
  randomId,
  unsignedEnvelope,
  type Envelope,
  type PhotoBlob,
} from './buddiesClient'

/**
 * Helpers for `pnpm test:e2e`: real HTTP against the worker started by
 * `node scripts/verify/dev.mjs up`. Every exchange lands in a transcript under
 * `.verify/artifacts/` so a run leaves evidence behind.
 */

export const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const STATE_PATH = join(ROOT, '.verify', 'state.json')
export const ARTIFACTS_DIR = join(ROOT, '.verify', 'artifacts')

interface VerifyState {
  url: string
  tokens?: {
    devBypass?: string
    admin?: string
    accountToken?: string
    revenueCatWebhook?: string
  }
  configured?: Record<string, boolean>
  revenueCatApiUrl?: string | null
}

const readState = (): VerifyState | null =>
  existsSync(STATE_PATH)
    ? (JSON.parse(readFileSync(STATE_PATH, 'utf8')) as VerifyState)
    : null

const state = readState()

/** `WW_API_URL` wins; otherwise the URL `dev.mjs up` recorded. */
export const BASE_URL = (process.env.WW_API_URL ?? state?.url ?? '').replace(
  /\/$/,
  ''
)
if (!BASE_URL) {
  throw new Error(
    'No worker URL: run `node scripts/verify/dev.mjs up` or set WW_API_URL'
  )
}

/** Only available for the local launcher's worker (synthetic tokens). */
export const DEV_BYPASS_TOKEN =
  process.env.WW_API_DEV_BYPASS_TOKEN ?? state?.tokens?.devBypass ?? null
export const ADMIN_TOKEN =
  process.env.WW_API_ADMIN_TOKEN ?? state?.tokens?.admin ?? null
/** The worker's `ACCOUNT_TOKEN_SECRET` (local launcher only), to mint tokens. */
export const ACCOUNT_TOKEN_SECRET = state?.tokens?.accountToken ?? null
/** The RevenueCat webhook's Authorization secret (local launcher only). */
export const REVENUECAT_WEBHOOK_TOKEN =
  process.env.WW_API_REVENUECAT_WEBHOOK_TOKEN ??
  state?.tokens?.revenueCatWebhook ??
  null
/** Where the worker expects the fake RevenueCat (`REVENUECAT_API_URL`). */
export const REVENUECAT_API_URL = state?.revenueCatApiUrl ?? null
export const configured = (name: string): boolean =>
  Boolean(state?.configured?.[name])
/** True when the worker is the launcher's local instance (KV helpers work). */
export const LOCAL_LAUNCHER = !process.env.WW_API_URL && state != null

let ipCounter = Math.floor(Math.random() * 60_000)
/** A fresh client IP per request so per-IP rate limits never couple tests. */
export const nextIp = (): string => {
  ipCounter = (ipCounter + 1) % 65_536
  return `198.18.${ipCounter >> 8}.${ipCounter & 255}`
}

/**
 * A fresh connection per request: `localKv` blocks the event loop while
 * wrangler runs, so fetch never sees the worker close an idle keep-alive
 * socket and the next request on it fails with "other side closed".
 * Cloudflare rejects synthetic caller IPs on real deployments.
 */
const callerHeaders = (): Record<string, string> => ({
  connection: 'close',
  ...(['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE_URL).hostname)
    ? { 'cf-connecting-ip': nextIp() }
    : {}),
})

export interface Exchange {
  status: number
  headers: Headers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
  text: string
  ms: number
}

const transcript: Array<Record<string, unknown>> = []
const clip = (text: string, max = 600) =>
  text.length > max ? `${text.slice(0, max)}…(${text.length} chars)` : text

export const http = async (
  method: string,
  path: string,
  init: {
    body?: unknown
    headers?: Record<string, string>
    raw?: string
    /** Defaults to 10 s; routes that wait on a slow upstream need longer. */
    timeoutMs?: number
  } = {}
): Promise<Exchange> => {
  const headers: Record<string, string> = {
    ...callerHeaders(),
    ...(init.body !== undefined || init.raw !== undefined
      ? { 'content-type': 'application/json' }
      : {}),
    ...init.headers,
  }
  const requestBody =
    init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body))
  const started = Date.now()
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: requestBody,
    signal: AbortSignal.timeout(init.timeoutMs ?? 10_000),
  })
  const text = await response.text()
  const ms = Date.now() - started
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // HTML or plain text
  }
  transcript.push({
    method,
    path,
    // Secret-bearing headers are recorded by name only.
    headers: Object.keys(headers),
    request: requestBody === undefined ? undefined : clip(requestBody),
    status: response.status,
    response: clip(text),
    ms,
  })
  return { status: response.status, headers: response.headers, body, text, ms }
}

export interface BytesExchange {
  status: number
  headers: Headers
  /** The response body on 200. */
  bytes: Uint8Array | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
  ms: number
}

const describeBytes = (bytes: Uint8Array) =>
  `<${bytes.byteLength} raw bytes>`

/**
 * A request whose body or answer is raw bytes (`blob/put`, `blob/get`). The
 * transcript records sizes, never the bytes or `x-buddies-*` values.
 */
export const httpBytes = async (
  path: string,
  init: { bytes?: Uint8Array; json?: unknown; headers?: Record<string, string> }
): Promise<BytesExchange> => {
  const headers: Record<string, string> = {
    ...callerHeaders(),
    'content-type': init.bytes ? 'application/octet-stream' : 'application/json',
    ...init.headers,
  }
  const requestBody = init.bytes ?? JSON.stringify(init.json ?? {})
  const started = Date.now()
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: requestBody,
    signal: AbortSignal.timeout(10_000),
  })
  const raw = new Uint8Array(await response.arrayBuffer())
  const ms = Date.now() - started
  const binary =
    response.status === 200 &&
    response.headers.get('content-type') === 'application/octet-stream'
  let body: unknown = null
  if (!binary) {
    const text = new TextDecoder().decode(raw)
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  transcript.push({
    method: 'POST',
    path,
    headers: Object.keys(headers),
    request:
      typeof requestBody === 'string' ? clip(requestBody) : describeBytes(requestBody),
    status: response.status,
    response: binary ? describeBytes(raw) : clip(JSON.stringify(body)),
    ms,
  })
  return {
    status: response.status,
    headers: response.headers,
    bytes: binary ? raw : null,
    body,
    ms,
  }
}

/** Writes this file's request/response transcript as proof. */
export const writeTranscript = (name: string): string => {
  mkdirSync(ARTIFACTS_DIR, { recursive: true })
  const path = join(
    ARTIFACTS_DIR,
    `e2e-${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  )
  writeFileSync(
    path,
    `${JSON.stringify({ baseUrl: BASE_URL, exchanges: transcript }, null, 2)}\n`
  )
  return path
}

/** Edits the launcher's isolated local KV (only valid with LOCAL_LAUNCHER). */
export const localKv = (
  action: 'get' | 'put' | 'delete',
  key: string,
  value?: string
): string => {
  const result = spawnSync(
    process.execPath,
    [
      join(ROOT, 'scripts/verify/dev.mjs'),
      'kv',
      action,
      key,
      ...(value === undefined ? [] : [value]),
    ],
    { cwd: ROOT, encoding: 'utf8' }
  )
  if (result.status !== 0) throw new Error(`kv ${action} failed: ${result.stderr}`)
  return result.stdout
}

// --- Buddies --------------------------------------------------------------

export const buddies = (op: string, envelopeBody: Envelope | unknown) =>
  http('POST', `/buddies/v1/${op}`, { body: envelopeBody })

export const sendSigned = async (
  op: BuddiesSignedOp,
  key: SigningKey,
  payload: Record<string, unknown>
) =>
  buddies(
    op,
    await envelope(op, { ts: Date.now(), nonce: randomId(), ...payload }, key)
  )

export const sendUnsigned = (op: string, payload: Record<string, unknown>) =>
  buddies(op, unsignedEnvelope(payload))

/** `blob/get`: an unsigned `{payload}` envelope (plus `headers`, e.g. a token); raw bytes back on 200. */
export const getBlob = (
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
) =>
  httpBytes('/buddies/v1/blob/get', {
    json: unsignedEnvelope(payload),
    headers,
  })

/** One synthetic person: an inbox and the owner key that signs for it. */
export class RelayOwner {
  readonly inboxId = randomId()
  private constructor(readonly key: SigningKey) {}

  static async register(): Promise<RelayOwner> {
    const owner = new RelayOwner(await SigningKey.generate())
    const response = await owner.send('inbox/register', {
      ownerPub: owner.key.publicKey,
    })
    if (response.status !== 200) {
      throw new Error(`inbox/register ${response.status} ${response.text}`)
    }
    return owner
  }

  send(op: BuddiesSignedOp, payload: Record<string, unknown> = {}) {
    return sendSigned(op, this.key, { inboxId: this.inboxId, ...payload })
  }

  sync(since = 0) {
    return this.send('inbox/sync', { since })
  }

  /** Adds a buddy's slot, as `blob/put` requires one. */
  async addWriter(slotId = randomId()): Promise<RelayWriter> {
    const key = await SigningKey.generate()
    const response = await this.send('slot/add', {
      slotId,
      writerPub: key.publicKey,
    })
    if (response.status !== 200) {
      throw new Error(`slot/add ${response.status} ${response.text}`)
    }
    return new RelayWriter(this.inboxId, slotId, key)
  }

  /**
   * `blob/put` of `blob`: the signed envelope in headers, the bytes as the
   * body. `fields` override the signed payload; `init` the body and headers.
   */
  async putBlob(
    blob: PhotoBlob,
    fields: Record<string, unknown> = {},
    init: { bytes?: Uint8Array; headers?: Record<string, string> } = {}
  ) {
    const payload = {
      inboxId: this.inboxId,
      blobId: blob.blobId,
      bytes: blob.bytes.byteLength,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      readTokenHash: blob.readTokenHash,
      ts: Date.now(),
      nonce: randomId(),
      ...fields,
    }
    return httpBytes('/buddies/v1/blob/put', {
      bytes: init.bytes ?? blob.bytes,
      headers: { ...(await blobPutHeaders(payload, this.key)), ...init.headers },
    })
  }

  /** `blob/get` of one of this inbox's blobs, with its token unless given. */
  getBlob(blob: PhotoBlob, token = blob.token) {
    return getBlob({ inboxId: this.inboxId, blobId: blob.blobId, token })
  }

  /** Signed `inbox/live` upgrade headers (fresh nonce each call). */
  liveHeaders(key: SigningKey = this.key) {
    return liveHeaders(
      { inboxId: this.inboxId, ts: Date.now(), nonce: randomId() },
      key
    )
  }
}

/** A buddy's write capability into one recipient inbox slot. */
export class RelayWriter {
  constructor(
    readonly inboxId: string,
    readonly slotId: string,
    readonly key: SigningKey
  ) {}

  send(op: BuddiesSignedOp, payload: Record<string, unknown> = {}) {
    return sendSigned(op, this.key, {
      inboxId: this.inboxId,
      slotId: this.slotId,
      ...payload,
    })
  }
}

// --- Account sessions (bearer requests) --------------------------------------

const encoder = new TextEncoder()

export interface E2ESession {
  key: SigningKey
  accountId: string
  sessionId: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  sessionExpiresAt: number
}

/**
 * Opens an account session with the dev bypass standing in for attestation
 * (`POST /accounts/v1/sessions`). Needs `DEV_BYPASS_TOKEN`.
 */
export const openSession = async (
  key?: SigningKey,
  /** What the app sends: its version, and `capabilities` (`sync-everyone`). */
  fields: { appVersion?: string; capabilities?: string[] } = {}
): Promise<E2ESession> => {
  const signingKey = key ?? (await SigningKey.generate())
  const bytes = encoder.encode(
    JSON.stringify({
      accountPub: signingKey.publicKey,
      ts: Date.now(),
      nonce: randomId(),
      ...fields,
    })
  )
  const response = await http('POST', '/accounts/v1/sessions', {
    headers: { 'x-ww-dev-bypass': DEV_BYPASS_TOKEN ?? '' },
    body: {
      payload: b64u(bytes),
      signature: b64u(
        await signingKey.sign(accountSignedMessage('session/open', bytes))
      ),
    },
  })
  if (response.status !== 201)
    throw new Error(`session open ${response.status} ${response.text}`)
  return { key: signingKey, ...(response.body as Omit<E2ESession, 'key'>) }
}

export const bearerHeaders = (session: E2ESession): Record<string, string> => ({
  authorization: `Bearer ${session.accessToken}`,
})

/** A bearer `inbox/live` or `blob/put`'s fields, for `x-buddies-payload`. */
export const fieldsHeader = (fields: Record<string, unknown>): string =>
  b64u(encoder.encode(JSON.stringify(fields)))

/**
 * One synthetic person on an account session: an inbox registered with a
 * bearer token and linked to the session's account, and owner ops sent as
 * bearer requests (plain JSON fields).
 */
export class BearerRelayOwner {
  readonly inboxId = randomId()
  private constructor(
    readonly session: E2ESession,
    readonly key: SigningKey
  ) {}

  /** A fresh owner key on `session` (a new session by default), registered unless `register` is false. */
  static async create(
    session?: E2ESession,
    register = true
  ): Promise<BearerRelayOwner> {
    const owner = new BearerRelayOwner(
      session ?? (await openSession()),
      await SigningKey.generate()
    )
    if (register) {
      const response = await owner.register()
      if (response.status !== 200)
        throw new Error(`inbox/register ${response.status} ${response.text}`)
    }
    return owner
  }

  /** Reuses an inbox and owner key registered the legacy way. */
  static adopt(
    legacy: RelayOwner,
    session: E2ESession
  ): BearerRelayOwner {
    return Object.assign(new BearerRelayOwner(session, legacy.key), {
      inboxId: legacy.inboxId,
    })
  }

  get auth(): Record<string, string> {
    return bearerHeaders(this.session)
  }

  /** `inbox/register`'s `account` proof for `account` (this session's by default). */
  async proof(account: E2ESession = this.session) {
    return {
      accountId: account.accountId,
      signature: b64u(
        await account.key.sign(
          inboxLinkMessage(account.accountId, this.inboxId, this.key.publicKey)
        )
      ),
    }
  }

  /** A bearer `inbox/register`: the token plus the self-signed envelope with a proof. */
  async register(
    fields: Record<string, unknown> = {},
    headers = this.auth
  ): Promise<Exchange> {
    const payload = {
      inboxId: this.inboxId,
      ownerPub: this.key.publicKey,
      account: await this.proof(),
      ts: Date.now(),
      nonce: randomId(),
      ...fields,
    }
    return http('POST', '/buddies/v1/inbox/register', {
      headers,
      body: await envelope('inbox/register', payload, this.key),
    })
  }

  /** A bearer owner op: plain JSON fields, no envelope. */
  op(
    op: BuddiesSignedOp,
    fields: Record<string, unknown> = {},
    headers = this.auth
  ): Promise<Exchange> {
    return http('POST', `/buddies/v1/${op}`, {
      headers,
      body: { inboxId: this.inboxId, ...fields },
    })
  }

  sync(since = 0, headers = this.auth) {
    return this.op('inbox/sync', { since }, headers)
  }

  /** Adds a buddy's slot (bearer); the writer signs its own ops. */
  async addWriter(slotId = randomId()): Promise<RelayWriter> {
    const key = await SigningKey.generate()
    const response = await this.op('slot/add', {
      slotId,
      writerPub: key.publicKey,
    })
    if (response.status !== 200)
      throw new Error(`slot/add ${response.status} ${response.text}`)
    return new RelayWriter(this.inboxId, slotId, key)
  }

  /** A bearer `blob/put`: the fields in `x-buddies-payload`, the bytes raw. */
  putBlob(
    blob: PhotoBlob,
    headers = this.auth,
    fields: Record<string, unknown> = {}
  ) {
    return httpBytes('/buddies/v1/blob/put', {
      bytes: blob.bytes,
      headers: {
        'x-buddies-payload': fieldsHeader({
          inboxId: this.inboxId,
          blobId: blob.blobId,
          bytes: blob.bytes.byteLength,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          readTokenHash: blob.readTokenHash,
          ...fields,
        }),
        ...headers,
      },
    })
  }

  /** Bearer `inbox/live` upgrade headers. */
  liveHeaders(headers = this.auth): Record<string, string> {
    return {
      upgrade: 'websocket',
      'x-buddies-payload': fieldsHeader({ inboxId: this.inboxId }),
      ...headers,
    }
  }
}

/** A writer op as a bearer request: the writer-signed envelope plus a token. */
export const sendWriter = async (
  writer: RelayWriter,
  op: BuddiesSignedOp,
  fields: Record<string, unknown>,
  headers: Record<string, string>
) =>
  http('POST', `/buddies/v1/${op}`, {
    headers,
    body: await envelope(
      op,
      {
        inboxId: writer.inboxId,
        slotId: writer.slotId,
        ts: Date.now(),
        nonce: randomId(),
        ...fields,
      },
      writer.key
    ),
  })

// --- Buddies live socket ----------------------------------------------------

export interface LiveConnection {
  /** The next text message, in order. */
  next(timeoutMs?: number): Promise<string>
  /** The close frame the server sent. */
  closed: Promise<{ code: number; reason: string }>
  send(text: string): void
  end(): void
}

export type LiveAttempt =
  | { status: 101; connection: LiveConnection }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { status: number; body: any }

/** A masked client frame (FIN set), as RFC 6455 requires of clients. */
const clientFrame = (opcode: number, payload: Buffer): Buffer => {
  const mask = nodeRandomBytes(4)
  const masked = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]))
  const length = payload.length
  const header =
    length < 126
      ? Buffer.from([0x80 | opcode, 0x80 | length])
      : Buffer.from([0x80 | opcode, 0x80 | 126, length >> 8, length & 255])
  return Buffer.concat([header, mask, masked])
}

const liveConnection = (socket: Socket, head: Buffer): LiveConnection => {
  const messages: string[] = []
  const waiters: Array<() => void> = []
  let resolveClosed: (close: { code: number; reason: string }) => void
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    resolveClosed = resolve
  })
  let buffer = Buffer.alloc(0)
  const read = (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      if (buffer.length < 2) return
      const opcode = buffer[0] & 0x0f
      let length = buffer[1] & 0x7f
      let offset = 2
      if (length === 126) {
        if (buffer.length < 4) return
        length = buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (buffer.length < 10) return
        length = Number(buffer.readBigUInt64BE(2))
        offset = 10
      }
      if (buffer.length < offset + length) return
      const payload = buffer.subarray(offset, offset + length)
      buffer = buffer.subarray(offset + length)
      if (opcode === 1) {
        messages.push(payload.toString('utf8'))
        for (const wake of waiters.splice(0)) wake()
      } else if (opcode === 8) {
        resolveClosed({
          code: payload.length >= 2 ? payload.readUInt16BE(0) : 1005,
          reason: payload.subarray(2).toString('utf8'),
        })
        socket.write(clientFrame(8, payload.subarray(0, 2)))
      }
    }
  }
  socket.on('data', read)
  socket.on('error', () => undefined)
  if (head.length) read(head)

  let taken = 0
  return {
    closed,
    next: (timeoutMs = 5_000) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`no live message within ${timeoutMs} ms`)),
          timeoutMs
        )
        const check = () => {
          if (taken < messages.length) {
            clearTimeout(timer)
            resolve(messages[taken++])
          } else waiters.push(check)
        }
        check()
      }),
    send: (text) => socket.write(clientFrame(1, Buffer.from(text, 'utf8'))),
    end: () => socket.destroy(),
  }
}

/**
 * `GET /buddies/v1/inbox/live` (or another live `path`, such as
 * `/accounts/v1/sync/live`) as a raw WebSocket handshake, so refusals keep
 * their status and JSON body. Header values never reach the transcript.
 */
export const openLive = (
  headers: Record<string, string>,
  path = '/buddies/v1/inbox/live'
): Promise<LiveAttempt> =>
  new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`)
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        headers: {
          connection: 'Upgrade',
          'sec-websocket-version': '13',
          'sec-websocket-key': nodeRandomBytes(16).toString('base64'),
          ...callerHeaders(),
          ...headers,
        },
        timeout: 10_000,
      }
    )
    const started = Date.now()
    const record = (status: number, response: string) =>
      transcript.push({
        method: 'GET',
        path,
        headers: Object.keys(headers),
        status,
        response: clip(response),
        ms: Date.now() - started,
      })
    request.on('upgrade', (response, socket, head) => {
      record(response.statusCode ?? 101, '(websocket)')
      resolve({ status: 101, connection: liveConnection(socket, head) })
    })
    request.on('response', (response) => {
      let text = ''
      response.on('data', (chunk) => (text += chunk))
      response.on('end', () => {
        record(response.statusCode ?? 0, text)
        let body: unknown = text
        try {
          body = JSON.parse(text)
        } catch {
          // plain text
        }
        resolve({ status: response.statusCode ?? 0, body })
      })
    })
    request.on('timeout', () => request.destroy(new Error('live handshake timed out')))
    request.on('error', reject)
    request.end()
  })

/**
 * Turns on Scribe AI's legacy switch (KV `scribe:legacy-notes-import`) in the
 * launcher's local KV, so a Notes Import suite reaches the old routes; returns
 * the restore. A remote worker answers with whatever its own KV says.
 */
export const enableLegacyNotesImport = (): (() => void) => {
  if (!LOCAL_LAUNCHER) return () => undefined
  const key = 'scribe:legacy-notes-import'
  const previous = localKv('get', key).trim()
  localKv('put', key, 'on')
  return () => {
    if (previous === '' || previous === 'Value not found') localKv('delete', key)
    else localKv('put', key, previous)
  }
}
