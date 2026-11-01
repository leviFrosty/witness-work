import {
  type HttpResponse,
  request,
  type RequestOptions,
} from '@/lib/http/request'
import { type LiveSocket, openHeaderSocket } from '@/lib/liveSignal'
import { logger } from '@/lib/logger'
import { bearerFailure } from '@/lib/serverAccount/bearerFailure'
import type { AttestationProblem } from '@/lib/serverAccount/session'
import { concatBytes, toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { ed25519Sign } from '@/features/buddies/lib/crypto'

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

    readonly retryAfterMs: number | null = null,

    readonly attestation: AttestationProblem | null = null
  ) {
    super(`Buddies relay error: ${code}`)
    this.name = 'RelayError'
  }
}

export const isRelayConnectivityError = (error: unknown) =>
  isRelayError(error, 'network') || isRelayError(error, 'timeout')

export const RELAY_TIMEOUT_MS = 15 * 1000

export const RELAY_FULL_SYNC_TIMEOUT_MS = 30 * 1000

export const RELAY_BLOB_TIMEOUT_MS = 60 * 1000

export type RelayCallOptions = { signal?: AbortSignal; timeoutMs?: number }

export function isRelayError(
  error: unknown,
  code?: RelayErrorCode
): error is RelayError {
  return (
    error instanceof RelayError && (code === undefined || error.code === code)
  )
}

export type InboxLink = {
  sign: (accountId: string) => string

  linked?: (accountId: string) => void
}

export type OwnerAuth = {
  inboxId: string
  ownerSeed: Uint8Array
  ownerPub: string
  link: InboxLink
}

export type WriterAuth = {
  inboxId: string
  slotId: string
  writerSeed: Uint8Array
}

export type PushTemplate = { title: string; body: string }

export type PushAddress =
  | {
      pushService?: 'apns'
      apnsToken: string
      apnsEnvironment: 'sandbox' | 'production'

      apnsTopic?: string
    }
  | {
      pushService: 'fcm'
      fcmToken: string

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

  capabilities?: { photos?: boolean }
}

export type BlobUpload = {
  blobId: string
  data: Uint8Array

  expiresAt: number

  readTokenHash: string
}

export type { LiveSocket }

export type RelayAuthorize = <T>(
  run: (authorization: string, session: { accountId: string }) => Promise<T>,
  call: { signal?: AbortSignal }
) => Promise<T>

export type RelayDeps = {
  baseUrl: string
  randomBytes: (length: number) => Uint8Array
  authorize: RelayAuthorize
  fetchImpl?: typeof fetch

  now?: () => number

  recalibrate?: () => Promise<unknown>

  onAccountActive?: () => void

  openSocket?: (url: string, headers: Record<string, string>) => LiveSocket
}

type RelayRequest = Pick<RequestOptions, 'headers' | 'json' | 'body'>

const SUSPENDED_ALLOWED_OPS: ReadonlySet<string> = new Set([
  'inbox/delete',
  'slot/remove',
])

const encodeFields = (fields: Record<string, unknown>) =>
  toB64u(utf8(JSON.stringify(fields)))

export function createRelayClient(deps: RelayDeps) {
  let skewMs = 0
  const now = () => (deps.now ?? Date.now)() + skewMs

  let staleServerTime: number | null = null

  const fetchImpl: typeof fetch = async (input, init) => {
    const response = await (deps.fetchImpl ?? fetch)(input, init)
    if (response.status === 401) {
      try {
        const body = (await response.clone().json()) as {
          serverTime?: unknown
        }
        if (typeof body?.serverTime === 'number' && body.serverTime > 0)
          staleServerTime = body.serverTime
      } catch {}
    }
    return response
  }

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

            retry: { retries: transport.idempotent ? 1 : 0 },
            fetchImpl,
          })
        },
        { signal: call.signal }
      )
    } catch (error) {
      const failure = relayErrorFrom(error)

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
    registerInbox,

    openLive: async (auth: OwnerAuth): Promise<LiveSocket> => {
      try {
        return await deps.authorize(
          async (authorization) =>
            (deps.openSocket ?? openHeaderSocket)(
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
    deleteInbox: (auth: OwnerAuth) => owner('inbox/delete', auth, {}),
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

    putBlob: (auth: OwnerAuth, blob: BlobUpload, call: RelayCallOptions = {}) =>
      linked(auth, call, () => putBlobOnce(auth, blob, call)),

    getBlob: async (
      ref: { inboxId: string; blobId: string; token: string },
      call: RelayCallOptions = {}
    ): Promise<Uint8Array> => {
      const response = await send<Uint8Array>(
        'blob/get',
        () => ({ json: { payload: encodeFields(ref) } }),
        call,

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

function relayErrorFrom(error: unknown): RelayError {
  if (error instanceof RelayError) return error
  const failure = bearerFailure(error, RELAY_ERROR_CODES)
  return new RelayError(
    failure.code,
    failure.status,
    failure.retryAfterMs,
    failure.attestation
  )
}
