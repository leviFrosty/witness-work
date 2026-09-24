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

export type RelayErrorCode =
  | (typeof RELAY_ERROR_CODES)[number]
  | 'network'
  | 'unknown'

export class RelayError extends Error {
  constructor(
    readonly code: RelayErrorCode,
    readonly status: number
  ) {
    super(`Buddies relay error: ${code}`)
    this.name = 'RelayError'
  }
}

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

export type RelayDeps = {
  baseUrl: string
  randomBytes: (length: number) => Uint8Array
  fetchImpl?: typeof fetch
  now?: () => number
}

export function createRelayClient(deps: RelayDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ?? Date.now

  async function post<T>(op: string, body: { p: string; s?: string }) {
    let response: Response
    try {
      response = await fetchImpl(`${deps.baseUrl}/buddies/v1/${op}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new RelayError('network', 0)
    }
    let json: { ok?: boolean; error?: string } | null = null
    try {
      json = (await response.json()) as { ok?: boolean; error?: string }
    } catch {
      json = null
    }
    if (!response.ok || json?.ok !== true) {
      const code = RELAY_ERROR_CODES.find((known) => known === json?.error)
      throw new RelayError(code ?? 'unknown', response.status)
    }
    return json as T
  }

  function signed<T>(
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
    return post<T>(op, { p: toB64u(payload), s: toB64u(signature) })
  }

  function unsigned<T>(op: string, fields: Record<string, unknown>) {
    return post<T>(op, { p: toB64u(utf8(JSON.stringify(fields))) })
  }

  const owner = (auth: OwnerAuth) => ({ inboxId: auth.inboxId })
  const writer = (auth: WriterAuth) => ({
    inboxId: auth.inboxId,
    slotId: auth.slotId,
  })

  return {
    registerInbox: (auth: OwnerAuth) =>
      signed('inbox/register', auth.ownerSeed, {
        ...owner(auth),
        ownerPub: auth.ownerPub,
      }),
    syncInbox: (auth: OwnerAuth, since: number) =>
      signed<RelaySyncResponse>('inbox/sync', auth.ownerSeed, {
        ...owner(auth),
        since,
      }),
    deleteInbox: (auth: OwnerAuth) =>
      signed('inbox/delete', auth.ownerSeed, owner(auth)),
    registerDevice: (
      auth: OwnerAuth,
      device: {
        deviceId: string
        apnsToken: string
        apnsEnvironment: 'sandbox' | 'production'
        templates: Record<string, PushTemplate>
      }
    ) =>
      signed('device/register', auth.ownerSeed, { ...owner(auth), ...device }),
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
    fetchInvite: (inviteId: string) =>
      unsigned<{ blob: string; expiresAt: number; status: 'open' | 'claimed' }>(
        'invite/fetch',
        { inviteId }
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
