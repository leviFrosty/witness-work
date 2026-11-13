import { HttpError, request } from '@/lib/http/request'
import { toB64u, utf8 } from '@/lib/bytes'
import { type LiveSocket, openHeaderSocket } from '@/lib/liveSignal'
import { bearerFailure } from '@/lib/serverAccount/bearerFailure'
import type { AttestationProblem } from '@/lib/serverAccount/session'
import { RECORD_ID_PATTERN, SPACE_ID_PATTERN } from '@/lib/sharedSpaces/crypto'
import { isLinkId, isScopeId } from '@/lib/sharedSpaces/scopes'

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

export type SpaceErrorCode =
  | (typeof SPACE_ERROR_CODES)[number]
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'unverified'
  | 'unknown'

export type SpaceGoneReason = 'ended' | 'expired'

export class SpaceError extends Error {
  constructor(
    readonly code: SpaceErrorCode,
    readonly status = 0,

    readonly retryAfterMs: number | null = null,

    readonly attestation: AttestationProblem | null = null,

    readonly reason: SpaceGoneReason | null = null
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

function goneReason(error: unknown): SpaceGoneReason | null {
  if (!(error instanceof HttpError) || error.serverCode !== 'gone') return null
  const reason = (error.body as { reason?: unknown } | null)?.reason
  return reason === 'ended' || reason === 'expired' ? reason : null
}

export function spaceErrorFrom(error: unknown): SpaceError {
  if (error instanceof SpaceError) return error
  const failure = bearerFailure(error, SPACE_ERROR_CODES)
  return new SpaceError(
    failure.code,
    failure.status,
    failure.retryAfterMs,
    failure.attestation,
    goneReason(error)
  )
}

export const SPACES_TIMEOUT_MS = 15 * 1000

export const SPACES_FULL_SYNC_TIMEOUT_MS = 30 * 1000

export const SPACES_PUT_TIMEOUT_MS = 60 * 1000

export const SPACE_LIMITS = {
  putRecords: 100,

  putBytes: 1024 * 1024,

  syncPage: 1000,

  inviteLifetimeMs: 7 * 24 * 60 * 60 * 1000,

  stampAheadMs: 24 * 60 * 60 * 1000,
} as const

export const GUEST_LIMITS = {
  putRecords: 20,

  putBytes: 64 * 1024,

  blobBytes: 4 * 1024,

  syncPage: 500,
} as const

export const SPACE_LIVE_HEADERS = {
  space: 'x-ww-space-auth',

  token: 'x-ww-space-token',
} as const

export type SpaceMemberAuth = {
  spaceId: string
  memberId: string

  token: string
}

export type SpaceWireRecord = {
  recordId: string
  epoch: number
  stamp: number
  deleted: boolean
  blob: string
  seq: number
}

export type SpacePutRecord = {
  recordId: string
  epoch: number
  stamp: number
  deleted?: boolean
  blob: string
}

export type SpaceMemberEntry = {
  memberId: string

  dhPub: string
  joinedAt: number
}

export type SpaceInviteEntry = {
  inviteId: string
  invitedBy: string
  expiresAt: number
}

export type SpaceMode = 'scoped'

export type ScopedMemberEntry = SpaceMemberEntry & {
  scopes: string[] | null

  invitedBy: string | null
}

export type ScopedInviteEntry = SpaceInviteEntry & {
  scopes: string[] | null
  handoff: boolean
}

export type SpaceHolderEntry = {
  scopeId: string

  memberId: string | null

  inviteId: string | null
  since: number
}

export type SpaceLinkEntry = {
  linkId: string
  createdBy: string
  scopes: string[]
  createdAt: number
  expiresAt: number
  endedAt: number | null
}

export type ScopedSyncState = {
  members: ScopedMemberEntry[]

  invites: ScopedInviteEntry[]

  holders: SpaceHolderEntry[]

  links: SpaceLinkEntry[]
}

export type SpaceSyncPage = {
  mode: SpaceMode | null

  scoped: ScopedSyncState | null

  seq: number

  epoch: number

  wrap: string
  ownerId: string

  members: SpaceMemberEntry[]

  invites: SpaceInviteEntry[]

  rekeyNeeded: boolean

  records: SpaceWireRecord[]

  more: boolean

  cursor: number
}

export type SpaceCallOptions = { signal?: AbortSignal }

export type SpaceNewMember = {
  memberId: string

  dhPub: string

  tokenHash: string

  wrap: string
}

export type SpacesAuthorize = <T>(
  run: (authorization: string) => Promise<T>,
  call: SpaceCallOptions
) => Promise<T>

export type SpacesClientDeps = {
  baseUrl: string
  authorize: SpacesAuthorize
  fetchImpl?: typeof fetch

  openSocket?: (url: string, headers: Record<string, string>) => LiveSocket
}

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value)
const isId = (value: unknown): value is string =>
  typeof value === 'string' && SPACE_ID_PATTERN.test(value)

const isKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)

const unexpected = (status: number) => new SpaceError('unknown', status)

const isScopeList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isScopeId)

const isNullableId = (value: unknown): value is string | null =>
  value === null || isId(value)

function readList<T>(
  value: unknown,
  read: (entry: Record<string, unknown>) => T | null
): T[] | null {
  if (!Array.isArray(value)) return null
  const out: T[] = []
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return null
    const parsed = read(entry as Record<string, unknown>)
    if (parsed === null) return null
    out.push(parsed)
  }
  return out
}

function readScopedState(
  data: Record<string, unknown>,
  members: SpaceMemberEntry[],
  invites: SpaceInviteEntry[]
): ScopedSyncState | null {
  const memberScopes = readList(data.members, (entry) =>
    (entry.scopes === null || isScopeList(entry.scopes)) &&
    isNullableId(entry.invitedBy)
      ? { scopes: entry.scopes, invitedBy: entry.invitedBy }
      : null
  )
  const inviteScopes = readList(data.invites, (entry) =>
    entry.scopes === undefined ||
    entry.scopes === null ||
    isScopeList(entry.scopes)
      ? { scopes: entry.scopes ?? null, handoff: entry.handoff === true }
      : null
  )
  const holders = readList(data.holders, (entry) =>
    isScopeId(entry.scopeId) &&
    isNullableId(entry.memberId) &&
    isNullableId(entry.inviteId) &&
    isInt(entry.since)
      ? {
          scopeId: entry.scopeId,
          memberId: entry.memberId,
          inviteId: entry.inviteId,
          since: entry.since,
        }
      : null
  )
  const links = readList(data.links, (entry) =>
    isLinkId(entry.linkId) &&
    isId(entry.createdBy) &&
    isScopeList(entry.scopes) &&
    isInt(entry.createdAt) &&
    isInt(entry.expiresAt) &&
    (entry.endedAt === null || isInt(entry.endedAt))
      ? {
          linkId: entry.linkId,
          createdBy: entry.createdBy,
          scopes: entry.scopes,
          createdAt: entry.createdAt,
          expiresAt: entry.expiresAt,
          endedAt: entry.endedAt,
        }
      : null
  )
  if (!memberScopes || !inviteScopes || !holders || !links) return null
  return {
    members: members.map((member, index) => ({
      ...member,
      ...(memberScopes[index] as Pick<
        ScopedMemberEntry,
        'scopes' | 'invitedBy'
      >),
    })),
    invites: invites.map((invite, index) => ({
      ...invite,
      ...(inviteScopes[index] as Pick<ScopedInviteEntry, 'scopes' | 'handoff'>),
    })),
    holders,
    links,
  }
}

function readRecords(
  records: unknown[],
  since: number
): { parsed: SpaceWireRecord[]; last: number } {
  let last = since
  const parsed: SpaceWireRecord[] = []
  for (const raw of records) {
    const rawSeq = (raw as { seq?: unknown } | null)?.seq
    if (isInt(rawSeq)) last = Math.max(last, rawSeq)
    const record = readRecord(raw)
    if (record) parsed.push(record)
  }
  return { parsed, last }
}

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
  const mode = data.mode === 'scoped' ? 'scoped' : null
  const scoped = mode ? readScopedState(data, members, invites) : null
  if (mode && !scoped) throw unexpected(status)
  const { parsed, last } = readRecords(records as unknown[], since)
  const hasMore = more === true

  if (hasMore && last <= since) throw unexpected(status)
  return {
    mode,
    scoped,
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

export const putRecordBytes = (record: SpacePutRecord) =>
  record.blob.length + record.recordId.length + 96

export type SpacePutResult = {
  seq: number
  results: { recordId: string; stored: boolean }[]
}

const putBody = (records: SpacePutRecord[]) =>
  records.map(({ recordId, epoch, stamp, deleted, blob }) => ({
    recordId,
    epoch,
    stamp,
    ...(deleted && { deleted: true }),
    blob,
  }))

function readPutResult(data: Record<string, unknown>): SpacePutResult {
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
}

function checkSince(since: number, limit: number | undefined, max: number) {
  if (!isInt(since) || since < 0) throw new Error('Invalid since')
  if (limit !== undefined && (!isInt(limit) || limit < 1 || limit > max))
    throw new Error('Invalid limit')
}

const seqOf = (data: Record<string, unknown>) => {
  if (!isInt(data.seq)) throw unexpected(200)
  return { seq: data.seq }
}

export type GuestLinkAuth = {
  spaceId: string
  linkId: string

  linkToken: string
}

export type GuestSyncPage = {
  seq: number
  epoch: number
  expiresAt: number
  records: SpaceWireRecord[]
  more: boolean
  cursor: number

  serverTime: number | null
}

export type GuestPutResult = SpacePutResult & { serverTime: number | null }

export type GuestSpacesClientDeps = {
  baseUrl: string
  fetchImpl?: typeof fetch
}

function serverTimeOf(headers: Headers): number | null {
  const date = headers.get('date')
  const time = date ? Date.parse(date) : NaN
  return Number.isFinite(time) ? time : null
}

export function createGuestSpacesClient(deps: GuestSpacesClientDeps) {
  async function post(
    op: string,
    body: Record<string, unknown>,
    call: SpaceCallOptions,
    timeoutMs: number
  ): Promise<{ data: Record<string, unknown>; serverTime: number | null }> {
    try {
      const response = await request<Record<string, unknown> | null>({
        url: `${deps.baseUrl}/spaces/v1/${op}`,
        method: 'POST',
        json: body,
        timeoutMs,
        signal: call.signal,
        idempotent: true,
        retry: { retries: 0 },
        fetchImpl: deps.fetchImpl,
      })
      if (response.data?.ok !== true) throw unexpected(response.status)
      return {
        data: response.data,
        serverTime: serverTimeOf(response.headers),
      }
    } catch (error) {
      throw spaceErrorFrom(error)
    }
  }

  const linkFields = (link: GuestLinkAuth) => ({
    spaceId: link.spaceId,
    linkId: link.linkId,
    linkToken: link.linkToken,
  })

  return {
    async guestSync(
      link: GuestLinkAuth,
      { since, limit }: { since: number; limit?: number },
      call: SpaceCallOptions = {}
    ): Promise<GuestSyncPage> {
      checkSince(since, limit, GUEST_LIMITS.syncPage)
      const { data, serverTime } = await post(
        'guest/sync',
        { ...linkFields(link), since, ...(limit !== undefined && { limit }) },
        call,
        since === 0 ? SPACES_FULL_SYNC_TIMEOUT_MS : SPACES_TIMEOUT_MS
      )
      const { seq, epoch, expiresAt, more, records } = data
      if (
        !isInt(seq) ||
        !isInt(epoch) ||
        epoch < 1 ||
        !isInt(expiresAt) ||
        !Array.isArray(records)
      )
        throw unexpected(200)
      const { parsed, last } = readRecords(records as unknown[], since)
      const hasMore = more === true
      if (hasMore && last <= since) throw unexpected(200)
      return {
        seq,
        epoch,
        expiresAt,
        records: parsed,
        more: hasMore,
        cursor: hasMore ? last : Math.max(seq, last),
        serverTime,
      }
    },

    async guestPut(
      link: GuestLinkAuth,
      records: SpacePutRecord[],
      call: SpaceCallOptions = {}
    ): Promise<GuestPutResult> {
      if (records.length < 1 || records.length > GUEST_LIMITS.putRecords)
        throw new Error('A guest put takes 1 to 20 records')
      const { data, serverTime } = await post(
        'guest/put',
        { ...linkFields(link), records: putBody(records) },
        call,
        SPACES_PUT_TIMEOUT_MS
      )
      return { ...readPutResult(data), serverTime }
    },
  }
}

export type GuestSpacesClient = ReturnType<typeof createGuestSpacesClient>

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

      catchUp?: boolean
    },
    call: SpaceCallOptions = {}
  ): Promise<SpaceSyncPage> {
    checkSince(since, limit, SPACE_LIMITS.syncPage)
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
    ...createGuestSpacesClient({
      baseUrl: deps.baseUrl,
      fetchImpl: deps.fetchImpl,
    }),

    async create(
      fields: SpaceNewMember & { spaceId: string; mode?: SpaceMode },
      call: SpaceCallOptions = {}
    ): Promise<{ seq: number; joinedAt: number }> {
      const { spaceId, memberId, dhPub, tokenHash, wrap, mode } = fields
      const { seq, joinedAt } = await post(
        'create',
        { spaceId, memberId, dhPub, tokenHash, wrap, ...(mode && { mode }) },
        call
      )
      if (!isInt(seq) || !isInt(joinedAt)) throw unexpected(200)
      return { seq, joinedAt }
    },

    sync,

    async syncFrom(
      auth: SpaceMemberAuth,
      since: number,
      onPage: (page: SpaceSyncPage) => void | Promise<void>,
      options: SpaceCallOptions & { limit?: number } = {}
    ): Promise<SpaceSyncPage> {
      let cursor = since

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

    async put(
      auth: SpaceMemberAuth,
      records: SpacePutRecord[],
      call: SpaceCallOptions = {}
    ): Promise<SpacePutResult> {
      if (records.length < 1 || records.length > SPACE_LIMITS.putRecords)
        throw new Error('A put takes 1 to 100 records')
      const data = await post(
        'put',
        { ...member(auth), records: putBody(records) },
        call,
        { idempotent: true, timeoutMs: SPACES_PUT_TIMEOUT_MS }
      )
      return readPutResult(data)
    },

    async createInvite(
      auth: SpaceMemberAuth,
      invite: {
        inviteId: string
        joinVerifier: string
        expiresAt: number
        epoch: number

        scopes?: string[]

        handoff?: boolean
      },
      call: SpaceCallOptions = {}
    ): Promise<void> {
      const { inviteId, joinVerifier, expiresAt, epoch, scopes, handoff } =
        invite
      await post(
        'invite/create',
        {
          ...member(auth),
          inviteId,
          joinVerifier,
          expiresAt,
          epoch,
          ...(scopes && { scopes }),
          ...(handoff && { handoff: true }),
        },
        call
      )
    },

    async deleteInvite(
      auth: SpaceMemberAuth,
      inviteId: string,
      call: SpaceCallOptions = {}
    ): Promise<void> {
      await post('invite/delete', { ...member(auth), inviteId }, call)
    },

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

    async removeMember(
      auth: SpaceMemberAuth,
      removeId: string,
      call: SpaceCallOptions = {}
    ): Promise<void> {
      await post('member/remove', { ...member(auth), removeId }, call)
    },

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

    async setMemberScopes(
      auth: SpaceMemberAuth,
      { target, scopes }: { target: string; scopes: string[] | null },
      call: SpaceCallOptions = {}
    ): Promise<void> {
      await post('member/scopes', { ...member(auth), target, scopes }, call)
    },

    async createHandoff(
      auth: SpaceMemberAuth,
      { scopeId, target }: { scopeId: string; target: string },
      call: SpaceCallOptions = {}
    ): Promise<{ seq: number }> {
      return seqOf(
        await post('handoff/create', { ...member(auth), scopeId, target }, call)
      )
    },

    async endHandoff(
      auth: SpaceMemberAuth,
      scopeId: string,
      call: SpaceCallOptions = {}
    ): Promise<{ seq: number }> {
      return seqOf(
        await post('handoff/end', { ...member(auth), scopeId }, call, {
          idempotent: true,
        })
      )
    },

    async createLink(
      auth: SpaceMemberAuth,
      link: {
        linkId: string
        verifier: string
        scopes: string[]
        expiresAt: number
        epoch: number
      },
      call: SpaceCallOptions = {}
    ): Promise<{ seq: number }> {
      const { linkId, verifier, scopes, expiresAt, epoch } = link
      return seqOf(
        await post(
          'link/create',
          { ...member(auth), linkId, verifier, scopes, expiresAt, epoch },
          call,
          { idempotent: true }
        )
      )
    },

    async endLink(
      auth: SpaceMemberAuth,
      linkId: string,
      call: SpaceCallOptions = {}
    ): Promise<{ seq: number }> {
      return seqOf(
        await post('link/end', { ...member(auth), linkId }, call, {
          idempotent: true,
        })
      )
    },

    async setLinkExpiry(
      auth: SpaceMemberAuth,
      fields: { linkId: string; expiresAt: number },
      call: SpaceCallOptions = {}
    ): Promise<{ seq: number }> {
      return seqOf(
        await post('link/expiry', { ...member(auth), ...fields }, call, {
          idempotent: true,
        })
      )
    },

    async deleteSpace(
      auth: SpaceMemberAuth,
      call: SpaceCallOptions = {}
    ): Promise<void> {
      await post('delete', member(auth), call)
    },

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
