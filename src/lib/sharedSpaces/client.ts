import { request } from '@/lib/http/request'
import { toB64u, utf8 } from '@/lib/bytes'
import { type LiveSocket, openHeaderSocket } from '@/lib/liveSignal'
import { bearerFailure } from '@/lib/serverAccount/bearerFailure'
import type { AttestationProblem } from '@/lib/serverAccount/session'
import { RECORD_ID_PATTERN, SPACE_ID_PATTERN } from '@/lib/sharedSpaces/crypto'

/**
 * Client for ww-api's Shared Spaces (`/spaces/v1/*`,
 * docs/shared-cars-protocol.md). Every op is `POST {BASE}/spaces/v1/{op}` with
 * a JSON body, so ids and secrets never reach a URL, and carries the attested
 * account session's bearer token through `authorize`
 * (`accountSessions.withSession` in the app): a 401 refreshes the token and
 * sends the op once more, and a 426 shows Update Required, exactly as for
 * Buddies and Cloud Sync. Member ops add the member's `spaceId`, `memberId` and
 * `token`. Failures throw `SpaceError` with the server's code; nothing it
 * carries names a space, member or secret.
 */

const SPACE_ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'suspended',
  'not_found',
  'conflict',
  'stale_key',
  'gone',
  'too_large',
  'limit',
  'rate_limited',
  'disabled',
  'upgrade_required',
] as const

/**
 * The server's codes, plus `network` (never reached it), `timeout` (no answer
 * in time), `cancelled` (the caller gave up), `unverified` (this device
 * couldn't prove it's WitnessWork, so it has no session) and `unknown`.
 */
export type SpaceErrorCode =
  | (typeof SPACE_ERROR_CODES)[number]
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'unverified'
  | 'unknown'

export class SpaceError extends Error {
  constructor(
    readonly code: SpaceErrorCode,
    readonly status = 0,
    /** How long the server asked callers to wait (its Retry-After), if it did. */
    readonly retryAfterMs: number | null = null,
    /** For `unverified`: whether it can't ever, or only couldn't now. */
    readonly attestation: AttestationProblem | null = null
  ) {
    super(`Shared Spaces error: ${code}`)
    this.name = 'SpaceError'
  }
}

export function isSpaceError(
  error: unknown,
  code?: SpaceErrorCode
): error is SpaceError {
  return (
    error instanceof SpaceError && (code === undefined || error.code === code)
  )
}

/** A failed call, or no session for it, as a `SpaceError`. */
export function spaceErrorFrom(error: unknown): SpaceError {
  if (error instanceof SpaceError) return error
  const failure = bearerFailure(error, SPACE_ERROR_CODES)
  return new SpaceError(
    failure.code,
    failure.status,
    failure.retryAfterMs,
    failure.attestation
  )
}

/** Most ops answer within a second; a stalled one gives up here. */
export const SPACES_TIMEOUT_MS = 15 * 1000
/**
 * A catch-up page (a sync from the start, or any page after one that said
 * `more`) can carry up to a thousand records, about 4 MiB.
 */
export const SPACES_FULL_SYNC_TIMEOUT_MS = 30 * 1000
/** A put of up to 1 MiB, on a phone connection. */
export const SPACES_PUT_TIMEOUT_MS = 60 * 1000

/** The server's caps (docs/shared-cars-protocol.md, "Limits and retention"). */
export const SPACE_LIMITS = {
  /** Records in one `put`. */
  putRecords: 100,
  /** One `put`'s body. */
  putBytes: 1024 * 1024,
  /** Records in one `sync` page. */
  syncPage: 1000,
  /** How far ahead an invite may expire (7 days, plus 5 minutes of slack). */
  inviteLifetimeMs: 7 * 24 * 60 * 60 * 1000,
  /** How far past the server's clock a stamp may be. */
  stampAheadMs: 24 * 60 * 60 * 1000,
} as const

/** The live signal's headers (docs/shared-cars-protocol.md, "Live signal"). */
export const SPACE_LIVE_HEADERS = {
  /**
   * `b64u(UTF-8 JSON { spaceId, memberId })`. Its name contains "auth", so
   * Cloudflare's logs redact it.
   */
  space: 'x-ww-space-auth',
  /** The member token, `b64u`. */
  token: 'x-ww-space-token',
} as const

/** What a member op proves membership with. */
export type SpaceMemberAuth = {
  spaceId: string
  memberId: string
  /** The member token, `b64u`. */
  token: string
}

/** A record as the server holds it. */
export type SpaceWireRecord = {
  recordId: string
  epoch: number
  stamp: number
  deleted: boolean
  blob: string
  seq: number
}

/** A record as a `put` sends it. */
export type SpacePutRecord = {
  recordId: string
  epoch: number
  stamp: number
  deleted?: boolean
  blob: string
}

/**
 * A member as `sync` lists them. Their `memberId` commits to `dhPub`
 * (`memberOwnsKey`), which a device checks before wrapping a key to them.
 */
export type SpaceMemberEntry = {
  memberId: string
  /** Their per-space X25519 public key, `b64u`. */
  dhPub: string
  joinedAt: number
}

export type SpaceInviteEntry = {
  inviteId: string
  invitedBy: string
  expiresAt: number
}

/** One `sync` answer. */
export type SpaceSyncPage = {
  /** The space's current `seq`. */
  seq: number
  /** The key epoch new records are sealed under. */
  epoch: number
  /** The caller's own wrap of the current epoch's key. */
  wrap: string
  ownerId: string
  /** Everyone on the space now. */
  members: SpaceMemberEntry[]
  /** The invitations open now. */
  invites: SpaceInviteEntry[]
  /** A member left or was removed since the current epoch began. */
  rekeyNeeded: boolean
  /** The current version of each record past `since`, in `seq` order. */
  records: SpaceWireRecord[]
  /** More records wait past `cursor`. */
  more: boolean
  /**
   * The `since` to sync from next, and the cursor to keep once this page is
   * applied: the last record's `seq` while `more`, else the space's `seq`.
   */
  cursor: number
}

export type SpaceCallOptions = { signal?: AbortSignal }

/** A member's fields on `create` and `join`, which the server checks. */
export type SpaceNewMember = {
  memberId: string
  /** Their X25519 public key, `b64u`; `memberId` must commit to it. */
  dhPub: string
  /** `b64u(SHA-256(token))`. */
  tokenHash: string
  /** The current epoch's key wrapped to `dhPub`. */
  wrap: string
}

/**
 * Runs `run` with the account session's `Authorization` header, refreshing the
 * session and running it once more after a 401. `accountSessions.withSession`
 * for the account key, in the app.
 */
export type SpacesAuthorize = <T>(
  run: (authorization: string) => Promise<T>,
  call: SpaceCallOptions
) => Promise<T>

export type SpacesClientDeps = {
  baseUrl: string
  authorize: SpacesAuthorize
  fetchImpl?: typeof fetch
  /** React Native's WebSocket, which can send headers, by default. */
  openSocket?: (url: string, headers: Record<string, string>) => LiveSocket
}

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value)
const isId = (value: unknown): value is string =>
  typeof value === 'string' && SPACE_ID_PATTERN.test(value)
/** `b64u` of 32 bytes: a public key. */
const isKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)

const unexpected = (status: number) => new SpaceError('unknown', status)

function readMembers(value: unknown): SpaceMemberEntry[] | null {
  if (!Array.isArray(value)) return null
  const members: SpaceMemberEntry[] = []
  for (const entry of value as {
    memberId?: unknown
    dhPub?: unknown
    joinedAt?: unknown
  }[]) {
    if (!isId(entry?.memberId) || !isKey(entry.dhPub) || !isInt(entry.joinedAt))
      return null
    members.push({
      memberId: entry.memberId,
      dhPub: entry.dhPub,
      joinedAt: entry.joinedAt,
    })
  }
  return members
}

function readInvites(value: unknown): SpaceInviteEntry[] | null {
  if (!Array.isArray(value)) return null
  const invites: SpaceInviteEntry[] = []
  for (const entry of value as {
    inviteId?: unknown
    invitedBy?: unknown
    expiresAt?: unknown
  }[]) {
    if (
      !isId(entry?.inviteId) ||
      !isId(entry.invitedBy) ||
      !isInt(entry.expiresAt)
    )
      return null
    invites.push({
      inviteId: entry.inviteId,
      invitedBy: entry.invitedBy,
      expiresAt: entry.expiresAt,
    })
  }
  return invites
}

function readRecord(value: unknown): SpaceWireRecord | null {
  const record = value as Partial<Record<keyof SpaceWireRecord, unknown>> | null
  if (
    typeof record?.recordId !== 'string' ||
    !RECORD_ID_PATTERN.test(record.recordId) ||
    !isInt(record.epoch) ||
    record.epoch < 1 ||
    !isInt(record.stamp) ||
    record.stamp < 0 ||
    typeof record.blob !== 'string' ||
    !isInt(record.seq)
  )
    return null
  return {
    recordId: record.recordId,
    epoch: record.epoch,
    stamp: record.stamp,
    deleted: record.deleted === true,
    blob: record.blob,
    seq: record.seq,
  }
}

/** Parses a `sync` answer; a record this version can't read is skipped. */
function readSyncPage(
  data: Record<string, unknown>,
  status: number,
  since: number
): SpaceSyncPage {
  const { seq, epoch, wrap, ownerId, rekeyNeeded, more, records } = data
  const members = readMembers(data.members)
  const invites = readInvites(data.invites)
  if (
    !isInt(seq) ||
    !isInt(epoch) ||
    epoch < 1 ||
    typeof wrap !== 'string' ||
    !isId(ownerId) ||
    !members ||
    !invites ||
    !Array.isArray(records)
  )
    throw unexpected(status)
  let last = since
  const parsed: SpaceWireRecord[] = []
  for (const raw of records as unknown[]) {
    const rawSeq = (raw as { seq?: unknown } | null)?.seq
    if (isInt(rawSeq)) last = Math.max(last, rawSeq)
    const record = readRecord(raw)
    if (record) parsed.push(record)
  }
  const hasMore = more === true
  // A page that says there's more must have moved past `since`, or paging
  // would ask for the same page forever.
  if (hasMore && last <= since) throw unexpected(status)
  return {
    seq,
    epoch,
    wrap,
    ownerId,
    members,
    invites,
    rekeyNeeded: rekeyNeeded === true,
    records: parsed,
    more: hasMore,
    cursor: hasMore ? last : Math.max(seq, last),
  }
}

/** The bytes a `put` body takes on the wire, near enough to stay under 1 MiB. */
export const putRecordBytes = (record: SpacePutRecord) =>
  record.blob.length + record.recordId.length + 96

export function createSpacesClient(deps: SpacesClientDeps) {
  async function post(
    op: string,
    body: Record<string, unknown>,
    call: SpaceCallOptions,
    transport: { timeoutMs?: number; idempotent?: boolean } = {}
  ): Promise<Record<string, unknown>> {
    try {
      const response = await deps.authorize(
        (authorization) =>
          request<Record<string, unknown> | null>({
            url: `${deps.baseUrl}/spaces/v1/${op}`,
            method: 'POST',
            headers: { authorization },
            json: body,
            timeoutMs: transport.timeoutMs ?? SPACES_TIMEOUT_MS,
            signal: call.signal,
            idempotent: transport.idempotent,
            // Only ops a lost answer can't double: reads, puts (the same
            // records again change nothing) and join (the server answers a
            // repeat with ok).
            retry: { retries: transport.idempotent ? 1 : 0 },
            fetchImpl: deps.fetchImpl,
          }),
        call
      )
      if (response.data?.ok !== true) throw unexpected(response.status)
      return response.data
    } catch (error) {
      throw spaceErrorFrom(error)
    }
  }

  const member = (auth: SpaceMemberAuth) => ({
    spaceId: auth.spaceId,
    memberId: auth.memberId,
    token: auth.token,
  })

  async function sync(
    auth: SpaceMemberAuth,
    {
      since,
      limit,
      catchUp = since === 0,
    }: {
      since: number
      limit?: number
      /** A page of a catch-up, which may be full: the longer timeout. */
      catchUp?: boolean
    },
    call: SpaceCallOptions = {}
  ): Promise<SpaceSyncPage> {
    if (!isInt(since) || since < 0) throw new Error('Invalid since')
    if (
      limit !== undefined &&
      (!isInt(limit) || limit < 1 || limit > SPACE_LIMITS.syncPage)
    )
      throw new Error('Invalid limit')
    const data = await post(
      'sync',
      { ...member(auth), since, ...(limit !== undefined && { limit }) },
      call,
      {
        idempotent: true,
        timeoutMs: catchUp ? SPACES_FULL_SYNC_TIMEOUT_MS : SPACES_TIMEOUT_MS,
      }
    )
    return readSyncPage(data, 200, since)
  }

  return {
    /**
     * Makes the space at epoch 1 with the caller as its only member and owner.
     * An identical retry on a space nothing has changed since (a lost answer)
     * gets the same answer again. `joinedAt` is the server's time.
     */
    async create(
      fields: SpaceNewMember & { spaceId: string },
      call: SpaceCallOptions = {}
    ): Promise<{ seq: number; joinedAt: number }> {
      const { spaceId, memberId, dhPub, tokenHash, wrap } = fields
      const { seq, joinedAt } = await post(
        'create',
        { spaceId, memberId, dhPub, tokenHash, wrap },
        call
      )
      if (!isInt(seq) || !isInt(joinedAt)) throw unexpected(200)
      return { seq, joinedAt }
    },

    sync,

    /**
     * Syncs from `since` until the server has nothing more, handing each page
     * to `onPage` before asking for the next (so a caller keeps its cursor as
     * it goes). Resolves the last page.
     */
    async syncFrom(
      auth: SpaceMemberAuth,
      since: number,
      onPage: (page: SpaceSyncPage) => void | Promise<void>,
      options: SpaceCallOptions & { limit?: number } = {}
    ): Promise<SpaceSyncPage> {
      let cursor = since
      // From the start, or once a page said there's more, every page may be
      // full: each gets the catch-up timeout.
      let catchUp = since === 0
      for (;;) {
        const page = await sync(
          auth,
          { since: cursor, limit: options.limit, catchUp },
          options
        )
        await onPage(page)
        if (!page.more) return page
        cursor = page.cursor
        catchUp = true
      }
    },

    /**
     * Stores up to 100 records, each unless the server holds a newer version.
     * `results` say which it stored, in order; `stored: false` means a newer
     * version is already there.
     */
    async put(
      auth: SpaceMemberAuth,
      records: SpacePutRecord[],
      call: SpaceCallOptions = {}
    ): Promise<{
      seq: number
      results: { recordId: string; stored: boolean }[]
    }> {
      if (records.length < 1 || records.length > SPACE_LIMITS.putRecords)
        throw new Error('A put takes 1 to 100 records')
      const data = await post(
        'put',
        {
          ...member(auth),
          records: records.map(({ recordId, epoch, stamp, deleted, blob }) => ({
            recordId,
            epoch,
            stamp,
            ...(deleted && { deleted: true }),
            blob,
          })),
        },
        call,
        { idempotent: true, timeoutMs: SPACES_PUT_TIMEOUT_MS }
      )
      const { seq, results } = data
      if (!isInt(seq) || !Array.isArray(results)) throw unexpected(200)
      const parsed: { recordId: string; stored: boolean }[] = []
      for (const result of results as {
        recordId?: unknown
        stored?: unknown
      }[]) {
        if (
          typeof result?.recordId !== 'string' ||
          typeof result.stored !== 'boolean'
        )
          throw unexpected(200)
        parsed.push({ recordId: result.recordId, stored: result.stored })
      }
      return { seq, results: parsed }
    },

    /**
     * Opens an invite carrying epoch `epoch`'s key, which must be current
     * (`stale_key` otherwise). An identical retry is ok.
     */
    async createInvite(
      auth: SpaceMemberAuth,
      invite: {
        inviteId: string
        joinVerifier: string
        expiresAt: number
        epoch: number
      },
      call: SpaceCallOptions = {}
    ): Promise<void> {
      const { inviteId, joinVerifier, expiresAt, epoch } = invite
      await post(
        'invite/create',
        { ...member(auth), inviteId, joinVerifier, expiresAt, epoch },
        call
      )
    },

    /** The inviter or the owner closes an invite. */
    async deleteInvite(
      auth: SpaceMemberAuth,
      inviteId: string,
      call: SpaceCallOptions = {}
    ): Promise<void> {
      await post('invite/delete', { ...member(auth), inviteId }, call)
    },

    /**
     * Joins with an invite, registering the caller's own key, token hash and a
     * wrap to themselves of the invitation's key, for its `epoch`, which must
     * be current (`stale_key`). A fresh join answers with that epoch. A repeat
     * after a lost answer is answered ok again, with the original `joinedAt`
     * and the current epoch; any other join by a member is `conflict`.
     */
    async join(
      fields: SpaceNewMember & {
        spaceId: string
        inviteId: string
        joinSecret: string
        epoch: number
      },
      call: SpaceCallOptions = {}
    ): Promise<{ seq: number; epoch: number; joinedAt: number }> {
      const {
        spaceId,
        inviteId,
        joinSecret,
        memberId,
        dhPub,
        tokenHash,
        wrap,
      } = fields
      const { seq, epoch, joinedAt } = await post(
        'join',
        {
          spaceId,
          inviteId,
          joinSecret,
          epoch: fields.epoch,
          memberId,
          dhPub,
          tokenHash,
          wrap,
        },
        call,
        { idempotent: true }
      )
      if (!isInt(seq) || !isInt(epoch) || epoch < 1 || !isInt(joinedAt))
        throw unexpected(200)
      return { seq, epoch, joinedAt }
    },

    async leave(
      auth: SpaceMemberAuth,
      call: SpaceCallOptions = {}
    ): Promise<void> {
      await post('leave', member(auth), call)
    },

    /** The owner removes another member. */
    async removeMember(
      auth: SpaceMemberAuth,
      removeId: string,
      call: SpaceCallOptions = {}
    ): Promise<void> {
      await post('member/remove', { ...member(auth), removeId }, call)
    },

    /**
     * The owner moves the space to `epoch` (current + 1), with a wrap for every
     * member and `link`, the record `k.<epoch>` sealed under the new key, which
     * the server stores in the same step. `conflict`: membership changed, so
     * sync and try again.
     */
    async rekey(
      auth: SpaceMemberAuth,
      fields: {
        epoch: number
        wraps: { memberId: string; wrap: string }[]
        link: { stamp: number; blob: string }
      },
      call: SpaceCallOptions = {}
    ): Promise<{ seq: number }> {
      const { epoch, wraps, link } = fields
      const { seq } = await post(
        'rekey',
        {
          ...member(auth),
          epoch,
          wraps,
          link: { stamp: link.stamp, blob: link.blob },
        },
        call
      )
      if (!isInt(seq)) throw unexpected(200)
      return { seq }
    },

    /** The owner wipes the space. */
    async deleteSpace(
      auth: SpaceMemberAuth,
      call: SpaceCallOptions = {}
    ): Promise<void> {
      await post('delete', member(auth), call)
    },

    /**
     * The space's live signal (`GET /spaces/v1/live`). The session and the
     * member ride in headers, never the URL: `x-ww-space-auth` names the space
     * and member, and the token travels alone in `x-ww-space-token`.
     * Cloudflare's logs redact both, by their names. Each (re)connect asks the
     * session for a token, refreshing one close to expiring; an open socket
     * outlives it.
     */
    async openLive(auth: SpaceMemberAuth): Promise<LiveSocket> {
      try {
        return await deps.authorize(
          async (authorization) =>
            (deps.openSocket ?? openHeaderSocket)(
              `${deps.baseUrl.replace(/^http/, 'ws')}/spaces/v1/live`,
              {
                authorization,
                [SPACE_LIVE_HEADERS.space]: toB64u(
                  utf8(
                    JSON.stringify({
                      spaceId: auth.spaceId,
                      memberId: auth.memberId,
                    })
                  )
                ),
                [SPACE_LIVE_HEADERS.token]: auth.token,
              }
            ),
          {}
        )
      } catch (error) {
        throw spaceErrorFrom(error)
      }
    },
  }
}

export type SpacesClient = ReturnType<typeof createSpacesClient>
