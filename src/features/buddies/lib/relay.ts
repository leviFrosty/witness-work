import {
  HttpError,
  type HttpResponse,
  request,
  type RequestOptions,
} from '@/lib/http/request'
import { logger } from '@/lib/logger'
import {
  AccountSessionError,
  type AttestationProblem,
  OPEN_RETRY_AFTER_MS,
} from '@/lib/serverAccount/session'
import { concatBytes, toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { ed25519Sign } from '@/features/buddies/lib/crypto'

/**
 * Client for the Buddies relay — wire contract in docs/buddies-protocol.md.
 * Every request carries this User's attested account session (ADR 0027,
 * "Authentication (sessions)" in the protocol).
 */

const RELAY_ERROR_CODES = [
  'bad_request',
  'bad_signature',
  'stale',
  'replay',
  'not_found',
  'conflict',
  'gone',
  'sealed',
  'limit',
  'rate_limited',
  'disabled',
  'too_large',
  'photos_disabled',
  'no_buddies',
  'suspended',
  'unknown_account',
  'unauthorized',
  'forbidden',
  'not_linked',
  'upgrade_required',
] as const

/**
 * The relay's own codes, plus `network` (never reached it), `timeout` (no
 * answer in time), `cancelled` (the caller gave up), `unverified` (this device
 * couldn't prove it's WitnessWork, so it has no session) and `unknown`.
 */
export type RelayErrorCode =
  | (typeof RELAY_ERROR_CODES)[number]
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'unverified'
  | 'unknown'

export class RelayError extends Error {
  constructor(
    readonly code: RelayErrorCode,
    readonly status: number,
    /** How long the relay asked callers to wait (its Retry-After), if it did. */
    readonly retryAfterMs: number | null = null,
    /** For `unverified`: whether it can't ever, or only couldn't now. */
    readonly attestation: AttestationProblem | null = null
  ) {
    super(`Buddies relay error: ${code}`)
    this.name = 'RelayError'
  }
}

/** The connection, not the relay, failed: retrying later may work. */
export const isRelayConnectivityError = (error: unknown) =>
  isRelayError(error, 'network') || isRelayError(error, 'timeout')

/** Most relay calls answer within a second; a stalled one gives up here. */
export const RELAY_TIMEOUT_MS = 15 * 1000
/** Reading an inbox from the start can carry every card and event at once. */
export const RELAY_FULL_SYNC_TIMEOUT_MS = 30 * 1000
/** A shared photo is up to 1 MiB, which a slow connection needs time for. */
export const RELAY_BLOB_TIMEOUT_MS = 60 * 1000

/**
 * Per call: a caller's `signal` cancels the request, and `timeoutMs` replaces
 * the default (shorter in the background, say).
 */
export type RelayCallOptions = { signal?: AbortSignal; timeoutMs?: number }

export function isRelayError(
  error: unknown,
  code?: RelayErrorCode
): error is RelayError {
  return (
    error instanceof RelayError && (code === undefined || error.code === code)
  )
}

/** Links this User's inbox to their server account (`inbox/register`). */
export type InboxLink = {
  /** The account key's signature over the link to `accountId`. */
  sign: (accountId: string) => string
  /** The relay says the inbox belongs to `accountId`, the session's. */
  linked?: (accountId: string) => void
}

/**
 * This User's own inbox. The session says who's calling; the owner key signs
 * only `inbox/register`, which proves the account holds the inbox's key.
 */
export type OwnerAuth = {
  inboxId: string
  ownerSeed: Uint8Array
  ownerPub: string
  link: InboxLink
}

/** Signs writes into one slot of someone else's inbox. */
export type WriterAuth = {
  inboxId: string
  slotId: string
  writerSeed: Uint8Array
}

export type PushTemplate = { title: string; body: string }

/**
 * How the relay reaches this device: APNs on iOS (the default, so iOS sends no
 * `pushService`), FCM on Android.
 */
export type PushAddress =
  | {
      pushService?: 'apns'
      apnsToken: string
      apnsEnvironment: 'sandbox' | 'production'
      /** The app's bundle id; the relay defaults to production's. */
      apnsTopic?: string
    }
  | {
      pushService: 'fcm'
      fcmToken: string
      /**
       * The app posts named alerts itself, so the relay sends the template as
       * fallback text expo-notifications doesn't show.
       */
      appAlerts?: true
    }

export type RelaySyncResponse = {
  seq: number
  /**
   * Every slot, open or `sealed` (its writer sealed it: that pairing writes no
   * more, but its card and events stay). A slot left after sealing is missing,
   * and its events are still listed.
   */
  slots: { slotId: string; createdAt: number; sealed?: boolean }[]
  cards: { slotId: string; blob: string; seq: number; updatedAt: number }[]
  events: {
    eventId: string
    slotId: string
    kind: string
    blob: string
    seq: number
    createdAt: number
  }[]
  roster: { blob: string; seq: number } | null
  /** What this relay offers; missing on older relays. */
  capabilities?: { photos?: boolean }
}

/** One encrypted shared photo, for `putBlob`. */
export type BlobUpload = {
  /** `b64u(SHA-256(data))`. */
  blobId: string
  data: Uint8Array
  /** When the relay may delete it (epoch ms). */
  expiresAt: number
  /** `b64u(SHA-256(readToken))`; the token itself goes only to buddies. */
  readTokenHash: string
}

/** The part of a WebSocket the live signal uses. */
export type LiveSocket = {
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: (() => void) | null
  onmessage: ((event: { data?: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: ((event: { code?: number; reason?: string }) => void) | null
}

/**
 * Runs `run` with this User's attested account session: the `Authorization`
 * header and the session's account. Throws `AccountSessionError` when there's
 * no session to be had, so no request goes out without one; a 401 for the token
 * refreshes it and runs `run` once more. `accountSessions.withSession` in the
 * app.
 */
export type RelayAuthorize = <T>(
  run: (authorization: string, session: { accountId: string }) => Promise<T>,
  call: { signal?: AbortSignal }
) => Promise<T>

export type RelayDeps = {
  baseUrl: string
  randomBytes: (length: number) => Uint8Array
  authorize: RelayAuthorize
  fetchImpl?: typeof fetch
  /** Signed requests' timestamps; the relay refuses one 5 minutes off. */
  now?: () => number
  /**
   * Corrects `now` after the relay refused a timestamp (`stale`) without saying
   * its own time (relays before `serverTime`): a device clock that's off would
   * otherwise fail every signed call for good. The call is then signed again
   * and sent once more.
   */
  recalibrate?: () => Promise<unknown>
  /**
   * A call the relay refuses for a suspended account went through, so the
   * account is active: `inbox/register`, or an owner op other than leaving
   * (`inbox/delete`, `slot/remove`).
   */
  onAccountActive?: () => void
  /** React Native's WebSocket, which can send headers, by default. */
  openSocket?: (url: string, headers: Record<string, string>) => LiveSocket
}

/** React Native's WebSocket takes headers; the DOM typings don't know it. */
type HeaderWebSocket = new (
  url: string,
  protocols: null,
  options: { headers: Record<string, string> }
) => LiveSocket

const openSocket = (url: string, headers: Record<string, string>) =>
  new (WebSocket as unknown as HeaderWebSocket)(url, null, { headers })

/** What one request sends besides its URL, method, and session. */
type RelayRequest = Pick<RequestOptions, 'headers' | 'json' | 'body'>

/** Owner ops the relay still takes from a suspended account: leaving. */
const SUSPENDED_ALLOWED_OPS: ReadonlySet<string> = new Set([
  'inbox/delete',
  'slot/remove',
])

/** A payload's fields as UTF-8 JSON, `b64u`: `payload`, or its header. */
const encodeFields = (fields: Record<string, unknown>) =>
  toB64u(utf8(JSON.stringify(fields)))

export function createRelayClient(deps: RelayDeps) {
  /**
   * How far the relay's clock is from `now`, learned from a `stale` answer's
   * `serverTime`; signed calls are stamped with it added.
   */
  let skewMs = 0
  const now = () => (deps.now ?? Date.now)() + skewMs
  /** `serverTime` from the last `stale` answer, until a retry uses it. */
  let staleServerTime: number | null = null

  /** Keeps the relay's own time from a `stale` answer (newer relays send it). */
  const fetchImpl: typeof fetch = async (input, init) => {
    const response = await (deps.fetchImpl ?? fetch)(input, init)
    if (response.status === 401) {
      try {
        const body = (await response.clone().json()) as {
          serverTime?: unknown
        }
        if (typeof body?.serverTime === 'number' && body.serverTime > 0)
          staleServerTime = body.serverTime
      } catch {
        // Not JSON, or an older relay: recalibrate the other way.
      }
    }
    return response
  }

  /**
   * Sends `op` with the session. `build` makes the request for each try (a 401
   * for the token is tried once more, with a freshly signed body), from the
   * session's account.
   */
  async function send<T>(
    op: string,
    build: (accountId: string) => RelayRequest,
    call: RelayCallOptions,
    transport: Pick<RequestOptions, 'responseType' | 'idempotent'> & {
      timeoutMs: number
    }
  ): Promise<HttpResponse<T>> {
    try {
      return await deps.authorize(
        (authorization, session) => {
          const built = build(session.accountId)
          return request<T>({
            url: `${deps.baseUrl}/buddies/v1/${op}`,
            method: 'POST',
            ...built,
            headers: { ...built.headers, authorization },
            responseType: transport.responseType,
            timeoutMs: call.timeoutMs ?? transport.timeoutMs,
            signal: call.signal,
            idempotent: transport.idempotent,
            // Signed envelopes carry a nonce the relay accepts once, so a
            // retry is a new request with a new signature; the engine decides
            // that. Only reads say otherwise.
            retry: { retries: transport.idempotent ? 1 : 0 },
            fetchImpl,
          })
        },
        { signal: call.signal }
      )
    } catch (error) {
      const failure = relayErrorFrom(error)
      // The session's account isn't the inbox's: a state this device should
      // never reach. Ids stay out of the log.
      if (failure.code === 'forbidden')
        logger.warn(`[buddies] ${op}: forbidden`)
      throw failure
    }
  }

  async function post<T>(
    op: string,
    build: (accountId: string) => RelayRequest,
    call: RelayCallOptions = {},
    timeoutMs = RELAY_TIMEOUT_MS
  ) {
    const response = await send<{ ok?: boolean } | null>(op, build, call, {
      timeoutMs,
    })
    if (response.data?.ok !== true)
      throw new RelayError('unknown', response.status)
    return response.data as T
  }

  function envelope(
    op: string,
    seed: Uint8Array,
    fields: Record<string, unknown>
  ) {
    const payload = utf8(
      JSON.stringify({
        ...fields,
        ts: now(),
        nonce: toB64u(deps.randomBytes(16)),
      })
    )
    const signature = ed25519Sign(
      concatBytes(utf8(`ww-buddies/v1\n${op}\n`), payload),
      seed
    )
    return { payload: toB64u(payload), signature: toB64u(signature) }
  }

  /** Sends a signed call; after `stale`, corrects the clock and sends again. */
  async function retryStale<T>(sendOnce: () => Promise<T>): Promise<T> {
    try {
      return await sendOnce()
    } catch (error) {
      if (!isRelayError(error, 'stale')) throw error
      const serverTime = staleServerTime
      staleServerTime = null
      if (serverTime !== null) skewMs += serverTime - now()
      else if (deps.recalibrate) await deps.recalibrate().catch(() => {})
      else throw error
      return sendOnce()
    }
  }

  /**
   * `inbox/register`: the owner's envelope, with the session account's claim
   * (required with a session), so the inbox is linked to the account.
   */
  async function registerInbox(auth: OwnerAuth, call: RelayCallOptions = {}) {
    let accountId = ''
    const response = await retryStale(() =>
      post<{ ok: true; accountId?: string }>(
        'inbox/register',
        (sessionAccountId) => {
          accountId = sessionAccountId
          return {
            json: envelope('inbox/register', auth.ownerSeed, {
              inboxId: auth.inboxId,
              ownerPub: auth.ownerPub,
              account: { accountId, signature: auth.link.sign(accountId) },
            }),
          }
        },
        call
      )
    )
    if (response.accountId === accountId) auth.link.linked?.(accountId)
    deps.onAccountActive?.()
    return response
  }

  /**
   * An inbox registered before accounts answers owner ops with `not_linked`:
   * link it (`inbox/register` with the account's claim), then send once more.
   */
  async function linked<T>(
    auth: OwnerAuth,
    call: RelayCallOptions,
    sendOnce: () => Promise<T>
  ): Promise<T> {
    try {
      return await sendOnce()
    } catch (error) {
      if (!isRelayError(error, 'not_linked')) throw error
      await registerInbox(auth, call)
      return sendOnce()
    }
  }

  /**
   * An owner op: the payload's fields as plain JSON. The session is the
   * authority, so there's no signature, `ts`, or `nonce`.
   */
  function owner<T>(
    op: string,
    auth: OwnerAuth,
    fields: Record<string, unknown>,
    call: RelayCallOptions = {},
    timeoutMs?: number
  ) {
    const result = linked(auth, call, () =>
      post<T>(
        op,
        () => ({ json: { inboxId: auth.inboxId, ...fields } }),
        call,
        timeoutMs
      )
    )
    if (SUSPENDED_ALLOWED_OPS.has(op)) return result
    return result.then((response) => {
      deps.onAccountActive?.()
      return response
    })
  }

  /** A writer op: the slot's writer envelope stays its capability. */
  function writer<T>(
    op: string,
    auth: WriterAuth,
    fields: Record<string, unknown>
  ) {
    return retryStale(() =>
      post<T>(op, () => ({
        json: envelope(op, auth.writerSeed, {
          inboxId: auth.inboxId,
          slotId: auth.slotId,
          ...fields,
        }),
      }))
    )
  }

  /** `invite/*`: the capability they carry, unsigned. */
  function capability<T>(
    op: string,
    fields: Record<string, unknown>,
    call?: RelayCallOptions
  ) {
    return post<T>(
      op,
      () => ({ json: { payload: encodeFields(fields) } }),
      call
    )
  }

  /** `blob/put`: the body is the raw bytes, so the fields ride in a header. */
  async function putBlobOnce(
    auth: OwnerAuth,
    blob: BlobUpload,
    call: RelayCallOptions
  ) {
    const response = await send<{ ok?: boolean } | null>(
      'blob/put',
      () => ({
        headers: {
          'content-type': 'application/octet-stream',
          'x-buddies-payload': encodeFields({
            inboxId: auth.inboxId,
            blobId: blob.blobId,
            bytes: blob.data.length,
            expiresAt: blob.expiresAt,
            readTokenHash: blob.readTokenHash,
          }),
        },
        body: blob.data,
      }),
      call,
      { timeoutMs: RELAY_BLOB_TIMEOUT_MS }
    )
    if (response.data?.ok !== true)
      throw new RelayError('unknown', response.status)
    return response.data as { ok: true; expiresAt: number }
  }

  return {
    /**
     * Registers the inbox and links it to the session's account (ADR 0024); the
     * answer's `accountId` says which account the inbox belongs to.
     */
    registerInbox,
    /**
     * The inbox's live signal: the relay says when something changed, and the
     * app syncs. The session and inbox ride in headers; ids never go in URLs.
     * Each (re)connect asks the session for a token, refreshing it when it's
     * close to expiring; an open socket outlives its token. React Native can't
     * say why a handshake failed, so a token the relay refused stays usable
     * here: after one, the live inbox syncs first (`LiveInboxDeps.verify`), and
     * that sync's 401 refreshes it.
     */
    openLive: async (auth: OwnerAuth): Promise<LiveSocket> => {
      try {
        return await deps.authorize(
          async (authorization) =>
            (deps.openSocket ?? openSocket)(
              `${deps.baseUrl.replace(/^http/, 'ws')}/buddies/v1/inbox/live`,
              {
                authorization,
                'x-buddies-payload': encodeFields({ inboxId: auth.inboxId }),
              }
            ),
          {}
        )
      } catch (error) {
        throw relayErrorFrom(error)
      }
    },
    syncInbox: (auth: OwnerAuth, since: number, call?: RelayCallOptions) =>
      owner<RelaySyncResponse>(
        'inbox/sync',
        auth,
        { since },
        call,
        since === 0 ? RELAY_FULL_SYNC_TIMEOUT_MS : RELAY_TIMEOUT_MS
      ),
    /**
     * `successor`: the account's inbox that takes this one's place after an
     * account key change, which the relay keeps for `inboxSuccessor`. It's
     * refused (`conflict`, nothing deleted) unless that inbox is the same
     * account's, linked under the account's key now.
     */
    deleteInbox: (
      auth: OwnerAuth,
      { successor }: { successor?: string } = {}
    ) => owner('inbox/delete', auth, successor ? { successor } : {}),
    /**
     * The inbox a deleted one named as its successor (for 90 days), or null.
     * Any session may ask: a buddy checks a reconnect invite with it.
     */
    inboxSuccessor: async (inboxId: string, call?: RelayCallOptions) => {
      const response = await post<{ ok: true; successor?: string | null }>(
        'inbox/successor',
        () => ({ json: { inboxId } }),
        call
      )
      return typeof response.successor === 'string' ? response.successor : null
    },
    registerDevice: (
      auth: OwnerAuth,
      device: PushAddress & {
        deviceId: string
        templates: Record<string, PushTemplate>
      },
      call?: RelayCallOptions
    ) => owner('device/register', auth, device, call),
    unregisterDevice: (auth: OwnerAuth, deviceId: string) =>
      owner('device/unregister', auth, { deviceId }),
    addSlot: (auth: OwnerAuth, slotId: string, writerPub: string) =>
      owner('slot/add', auth, { slotId, writerPub }),
    removeSlot: (auth: OwnerAuth, slotId: string) =>
      owner('slot/remove', auth, { slotId }),
    putRoster: (auth: OwnerAuth, blob: string) =>
      owner<{ seq: number }>('roster/put', auth, { blob }),
    createInvite: (
      auth: OwnerAuth,
      invite: {
        inviteId: string
        claimVerifier: string
        blob: string
        expiresAt: number
      }
    ) => owner('invite/create', auth, invite),
    deleteInvite: (auth: OwnerAuth, inviteId: string) =>
      owner('invite/delete', auth, { inviteId }),
    fetchInvite: (inviteId: string, call?: RelayCallOptions) =>
      capability<{
        blob: string
        expiresAt: number
        status: 'open' | 'claimed'
      }>('invite/fetch', { inviteId }, call),
    claimInvite: (inviteId: string, claimSecret: string, blob: string) =>
      capability('invite/claim', { inviteId, claimSecret, blob }),
    putCard: (auth: WriterAuth, blob: string) =>
      writer<{ seq: number }>('card/put', auth, { blob }),
    putEvent: (
      auth: WriterAuth,
      event: { eventId: string; kind: string; blob: string; push: boolean }
    ) => writer<{ seq: number }>('event/put', auth, event),
    leaveSlot: (auth: WriterAuth) => writer('slot/leave', auth, {}),
    /**
     * Seals this User's slot in a buddy's inbox for good: every writer op from
     * it but leaving is then `sealed`, whoever signs it. Leaving a sealed slot
     * keeps its events for the buddy to read.
     */
    sealSlot: (auth: WriterAuth) => writer('slot/seal', auth, {}),
    /**
     * Stores an encrypted shared photo under this inbox. Putting the same blob
     * again only extends its expiry.
     */
    putBlob: (auth: OwnerAuth, blob: BlobUpload, call: RelayCallOptions = {}) =>
      linked(auth, call, () => putBlobOnce(auth, blob, call)),
    /**
     * A buddy's shared photo, still encrypted. Any miss (unknown, expired, or a
     * wrong token) is the same `not_found`.
     */
    getBlob: async (
      ref: { inboxId: string; blobId: string; token: string },
      call: RelayCallOptions = {}
    ): Promise<Uint8Array> => {
      const response = await send<Uint8Array>(
        'blob/get',
        () => ({ json: { payload: encodeFields(ref) } }),
        call,
        // Reading a blob changes nothing, so a lost answer can be retried.
        {
          timeoutMs: RELAY_BLOB_TIMEOUT_MS,
          responseType: 'bytes',
          idempotent: true,
        }
      )
      return response.data
    },
    deleteBlobs: (auth: OwnerAuth, blobIds: string[]) =>
      owner('blob/delete', auth, { blobIds }),
  }
}

export type RelayClient = ReturnType<typeof createRelayClient>

/** No session to send with, as the relay error Buddies shows for it. */
function relayErrorFromSession(error: AccountSessionError): RelayError {
  const status = error.status ?? 0
  switch (error.failure) {
    case 'offline':
      return new RelayError('network', 0)
    case 'cancelled':
      return new RelayError('cancelled', 0)
    case 'attestation': {
      // The session waits this long before attesting again by itself.
      const problem = error.attestation ?? 'failed'
      return new RelayError(
        'unverified',
        status,
        OPEN_RETRY_AFTER_MS[problem],
        problem
      )
    }
    case 'upgrade':
      return new RelayError('upgrade_required', status || 426)
    case 'unavailable':
      // Accounts are off on the server, and Buddies needs one.
      return new RelayError(
        error.serverCode === 'disabled' ? 'disabled' : 'unknown',
        status,
        error.retryAfterMs
      )
    case 'rateLimited':
      return new RelayError('rate_limited', status || 429, error.retryAfterMs)
    // Signed out after a key change elsewhere: Buddies waits for a sign-in.
    case 'keyRetired':
      return new RelayError('cancelled', 0)
    case 'server':
      return new RelayError(
        status === 401 ? 'unauthorized' : 'unknown',
        status,
        error.retryAfterMs
      )
  }
}

/** A failed `request()`, or no session for it, as the relay's own error. */
function relayErrorFrom(error: unknown): RelayError {
  if (error instanceof RelayError) return error
  if (error instanceof AccountSessionError) return relayErrorFromSession(error)
  if (!(error instanceof HttpError)) return new RelayError('network', 0)
  switch (error.kind) {
    case 'offline':
      return new RelayError('network', 0)
    case 'timeout':
      // A 408 is the server's; anything else never got an answer.
      return new RelayError('timeout', error.status ?? 0)
    case 'cancelled':
      return new RelayError('cancelled', 0)
  }
  const code = RELAY_ERROR_CODES.find((known) => known === error.serverCode)
  return new RelayError(
    code ?? (error.status === 429 ? 'rate_limited' : 'unknown'),
    error.status ?? 0,
    error.retryAfterMs
  )
}
