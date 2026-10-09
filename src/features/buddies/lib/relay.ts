import { HttpError, request } from '@/lib/http/request'
import { concatBytes, toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { ed25519Sign } from '@/features/buddies/lib/crypto'

/** Client for the Buddies relay — wire contract in docs/buddies-protocol.md. */

const RELAY_ERROR_CODES = [
  'bad_request',
  'bad_signature',
  'stale',
  'replay',
  'not_found',
  'conflict',
  'gone',
  'limit',
  'rate_limited',
  'disabled',
] as const

/**
 * The relay's own codes, plus `network` (never reached it), `timeout` (no
 * answer in time), `cancelled` (the caller gave up) and `unknown`.
 */
export type RelayErrorCode =
  | (typeof RELAY_ERROR_CODES)[number]
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'unknown'

export class RelayError extends Error {
  constructor(
    readonly code: RelayErrorCode,
    readonly status: number,
    /** How long the relay asked callers to wait (its Retry-After), if it did. */
    readonly retryAfterMs: number | null = null
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

/** Signs owner ops for one inbox. */
export type OwnerAuth = {
  inboxId: string
  ownerSeed: Uint8Array
  ownerPub: string
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
  slots: { slotId: string; createdAt: number }[]
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

export type RelayDeps = {
  baseUrl: string
  randomBytes: (length: number) => Uint8Array
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

  async function post<T>(
    op: string,
    body: { p: string; s?: string },
    call: RelayCallOptions = {},
    fullSync = false
  ) {
    let response: { status: number; data: { ok?: boolean } | null }
    try {
      response = await request<{ ok?: boolean } | null>({
        url: `${deps.baseUrl}/buddies/v1/${op}`,
        method: 'POST',
        json: body,
        timeoutMs:
          call.timeoutMs ??
          (fullSync ? RELAY_FULL_SYNC_TIMEOUT_MS : RELAY_TIMEOUT_MS),
        signal: call.signal,
        // Signed envelopes carry a nonce the relay accepts once, so a retry
        // is a new request with a new signature; the engine decides that.
        retry: { retries: 0 },
        fetchImpl,
      })
    } catch (error) {
      throw relayErrorFrom(error)
    }
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
    return { p: toB64u(payload), s: toB64u(signature) }
  }

  async function signed<T>(
    op: string,
    seed: Uint8Array,
    fields: Record<string, unknown>,
    call?: RelayCallOptions,
    fullSync = false
  ) {
    try {
      return await post<T>(op, envelope(op, seed, fields), call, fullSync)
    } catch (error) {
      if (!isRelayError(error, 'stale')) throw error
      const serverTime = staleServerTime
      staleServerTime = null
      if (serverTime !== null) skewMs += serverTime - now()
      else if (deps.recalibrate) await deps.recalibrate().catch(() => {})
      else throw error
      return post<T>(op, envelope(op, seed, fields), call, fullSync)
    }
  }

  function unsigned<T>(
    op: string,
    fields: Record<string, unknown>,
    call?: RelayCallOptions
  ) {
    return post<T>(op, { p: toB64u(utf8(JSON.stringify(fields))) }, call)
  }

  const owner = (auth: OwnerAuth) => ({ inboxId: auth.inboxId })
  const writer = (auth: WriterAuth) => ({
    inboxId: auth.inboxId,
    slotId: auth.slotId,
  })

  return {
    registerInbox: (auth: OwnerAuth, call?: RelayCallOptions) =>
      signed(
        'inbox/register',
        auth.ownerSeed,
        { ...owner(auth), ownerPub: auth.ownerPub },
        call
      ),
    /**
     * The inbox's live signal: the relay says when something changed, and the
     * app syncs. Auth rides in headers; ids never go in URLs.
     */
    openLive: (auth: OwnerAuth) => {
      const { p, s } = envelope('inbox/live', auth.ownerSeed, owner(auth))
      return (deps.openSocket ?? openSocket)(
        `${deps.baseUrl.replace(/^http/, 'ws')}/buddies/v1/inbox/live`,
        { 'x-buddies-p': p, 'x-buddies-s': s }
      )
    },
    syncInbox: (auth: OwnerAuth, since: number, call?: RelayCallOptions) =>
      signed<RelaySyncResponse>(
        'inbox/sync',
        auth.ownerSeed,
        { ...owner(auth), since },
        call,
        since === 0
      ),
    deleteInbox: (auth: OwnerAuth) =>
      signed('inbox/delete', auth.ownerSeed, owner(auth)),
    registerDevice: (
      auth: OwnerAuth,
      device: PushAddress & {
        deviceId: string
        templates: Record<string, PushTemplate>
      },
      call?: RelayCallOptions
    ) =>
      signed(
        'device/register',
        auth.ownerSeed,
        { ...owner(auth), ...device },
        call
      ),
    unregisterDevice: (auth: OwnerAuth, deviceId: string) =>
      signed('device/unregister', auth.ownerSeed, { ...owner(auth), deviceId }),
    addSlot: (auth: OwnerAuth, slotId: string, writerPub: string) =>
      signed('slot/add', auth.ownerSeed, { ...owner(auth), slotId, writerPub }),
    removeSlot: (auth: OwnerAuth, slotId: string) =>
      signed('slot/remove', auth.ownerSeed, { ...owner(auth), slotId }),
    putRoster: (auth: OwnerAuth, blob: string) =>
      signed<{ seq: number }>('roster/put', auth.ownerSeed, {
        ...owner(auth),
        blob,
      }),
    createInvite: (
      auth: OwnerAuth,
      invite: {
        inviteId: string
        claimVerifier: string
        blob: string
        expiresAt: number
      }
    ) => signed('invite/create', auth.ownerSeed, { ...owner(auth), ...invite }),
    deleteInvite: (auth: OwnerAuth, inviteId: string) =>
      signed('invite/delete', auth.ownerSeed, { ...owner(auth), inviteId }),
    fetchInvite: (inviteId: string, call?: RelayCallOptions) =>
      unsigned<{ blob: string; expiresAt: number; status: 'open' | 'claimed' }>(
        'invite/fetch',
        { inviteId },
        call
      ),
    claimInvite: (inviteId: string, claimSecret: string, blob: string) =>
      unsigned('invite/claim', { inviteId, claimSecret, blob }),
    putCard: (auth: WriterAuth, blob: string) =>
      signed<{ seq: number }>('card/put', auth.writerSeed, {
        ...writer(auth),
        blob,
      }),
    putEvent: (
      auth: WriterAuth,
      event: { eventId: string; kind: string; blob: string; push: boolean }
    ) =>
      signed<{ seq: number }>('event/put', auth.writerSeed, {
        ...writer(auth),
        ...event,
      }),
    leaveSlot: (auth: WriterAuth) =>
      signed('slot/leave', auth.writerSeed, writer(auth)),
  }
}

export type RelayClient = ReturnType<typeof createRelayClient>

/** A failed `request()` as the relay's own error. */
function relayErrorFrom(error: unknown): RelayError {
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
