import { sha256 } from '@noble/hashes/sha2.js'
import { fromB64u, fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import type { AttestedRequest } from '@/lib/attestation/appAttest'
import type { LiveSocket } from '@/lib/liveSignal'
import { createAccountSessions } from '@/lib/serverAccount/session'
import {
  createSpacesClient,
  SPACE_LIVE_HEADERS,
} from '@/lib/sharedSpaces/client'
import {
  memberIdFor,
  memberOwnsKey,
  wrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import {
  checkHandoffCreate,
  checkHandoffEnd,
  checkLeave,
  checkLinkCreate,
  checkLinkEnd,
  checkMemberRemove,
  checkMemberScopes,
  checkShare,
  isScopedRecordId,
  mayReadRecord,
  mayWriteRecord,
  parseScopedRecordId,
  SCOPED_LIMITS,
  type ScopedActor,
  type ScopedCheck,
  type ScopedSpaceView,
  validScopeList,
} from '@/lib/sharedSpaces/records'
import { isLinkId } from '@/lib/sharedSpaces/scopes'

type Member = {
  tokenHash: string
  dhPub: string
  joinedAt: number

  wrap: string

  scopes: string[] | null

  invitedBy: string | null
}

type Holder = {
  memberId: string | null
  inviteId: string | null
  since: number
}

type Link = {
  createdBy: string
  verifier: string
  scopes: string[]
  createdAt: number
  expiresAt: number
  endedAt: number | null
  epoch: number
  syncs: number[]
  puts: number[]
  stored: { at: number; count: number }[]
}

type Invite = {
  verifier: string
  expiresAt: number
  invitedBy: string
  createdAt: number
  wrong: number

  scopes: string[] | null

  handoff: boolean

  joined?: { memberId: string; dhPub: string; tokenHash: string }
}

type StoredRecord = {
  epoch: number
  stamp: number
  deleted: boolean
  blob: string
  blobHash: string
  seq: number
}

type LoggedInvite = {
  invitedBy: string
  scopes: string[] | null
  handoff: boolean
}

type Space = {
  mode: 'scoped' | null
  holders: Map<string, Holder>
  inviteLog: Map<string, LoggedInvite>
  links: Map<string, Link>
  linksCreated: number[]
  seq: number
  epoch: number
  ownerId: string
  members: Map<string, Member>
  invites: Map<string, Invite>

  closedInvites: Map<string, number>
  records: Map<string, StoredRecord>
  rekeyNeeded: boolean

  created: {
    memberId: string
    dhPub: string
    tokenHash: string
    wrap: string
    mode: 'scoped' | null
  }
}

type Phantom = { dhPub: string; joinedAt: number }

type FakeLive = LiveSocket & {
  spaceId: string
  memberId: string
  openedAt: number
  closed: boolean
}

const MAX_RECORDS = 50_000
const BLOB_MAX = 16 * 1024
const PUT_RECORDS = 100
const SYNC_RECORDS = 1000
const SYNC_CHARS = 4 * 1024 * 1024
const INVITE_MAX_MS = 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000
const STAMP_AHEAD_MS = 24 * 60 * 60 * 1000
const BAD_JOINS = 5
const SPACES_PER_DAY = 20
const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const GUEST_PUT_RECORDS = 20
const GUEST_BODY_CHARS = 64 * 1024
const GUEST_BLOB_MAX = 4 * 1024
const GUEST_SYNC_RECORDS = 500
const GUEST_SYNCS_PER_MINUTE = 120
const GUEST_PUTS_PER_MINUTE = 30
const GUEST_RECORDS_PER_DAY = 2000
const LINK_LISTED_AFTER_EXPIRY_MS = DAY_MS

const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/

const SCOPED_ONLY = new Set([
  'member/scopes',
  'handoff/create',
  'handoff/end',
  'link/create',
  'link/end',
  'link/expiry',
])

const CHECK_STATUS: Record<Exclude<ScopedCheck, 'ok'>, number> = {
  forbidden: 403,
  conflict: 409,
  bad_request: 400,
}

const SOCKETS_PER_PLACE = 4

const WHILE_DISABLED = new Set([
  'leave',
  'member/remove',
  'delete',
  'handoff/end',
  'link/end',
])

const REFUSED_WHILE_SUSPENDED = new Set([
  'create',
  'put',
  'invite/create',
  'join',
  'member/scopes',
  'handoff/create',
  'link/create',
  'link/expiry',
])

const hashB64u = (text: string) => toB64u(sha256(fromB64u(text)))

const blobHash = (blob: string) =>
  Array.from(sha256(fromB64u(blob)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')

type PutRecordBody = {
  recordId: string
  epoch: number
  stamp: number
  deleted?: boolean
  blob: string
}

export type FakeSpacesServer = ReturnType<typeof createFakeSpacesServer>

export function createFakeSpacesServer({
  now,
  maxMembers = 10,
  androidSockets = false,
  pageRecords = SYNC_RECORDS,
}: {
  now: () => number
  maxMembers?: number

  pageRecords?: number

  androidSockets?: boolean
}) {
  const spaces = new Map<string, Space>()

  const deleted = new Set<string>()
  const accounts = new Map<string, { accountPub: string; suspended: boolean }>()
  const sessions = new Map<
    string,
    { accountId: string; refreshToken: string }
  >()
  const accessTokens = new Map<
    string,
    { accountId: string; sessionId: string }
  >()
  const sockets = new Set<FakeLive>()

  const forgedKeys = new Map<string, string>()

  const plantedWraps = new Map<
    string,
    Map<string, { epoch: number; wrap: string }>
  >()

  const phantoms = new Map<string, Map<string, Phantom>>()
  let issued = 0
  const state = {
    enabled: true,

    guests: true,

    maxMembers,

    log: [] as string[],

    refusals: [] as [string, number, string, number?][],

    refusedSockets: [] as number[],

    created: new Map<string, number>(),

    socketsOpened: 0,

    rekeys: [] as { spaceId: string; epoch: number; memberIds: string[] }[],
  }

  const json = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {}
  ) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  const fail = (
    status: number,
    code: string,
    retryAfter?: number,
    extra: Record<string, unknown> = {}
  ) =>
    json(
      {
        ok: false,
        error: code,
        code,
        ...extra,
        ...(retryAfter !== undefined && { retryAfter }),
      },
      status,
      retryAfter !== undefined ? { 'retry-after': String(retryAfter) } : {}
    )
  const refuse = (check: ScopedCheck) =>
    check === 'ok' ? null : fail(CHECK_STATUS[check], check)
  const ok = (body: Record<string, unknown> = {}) => json({ ok: true, ...body })

  const openSocketsOf = (spaceId: string) =>
    [...sockets].filter(
      (socket) => socket.spaceId === spaceId && !socket.closed
    )

  function notify(spaceId: string) {
    const space = spaces.get(spaceId)
    if (!space) return
    for (const socket of openSocketsOf(spaceId))
      socket.onmessage?.({
        data: JSON.stringify({ type: 'changed', seq: space.seq }),
      })
  }

  function closeSocket(socket: FakeLive, code: number, reason: string) {
    if (socket.closed) return
    socket.closed = true
    sockets.delete(socket)
    socket.onclose?.({ code, reason })
  }

  function closeSockets(spaceId: string, memberId?: string) {
    for (const socket of openSocketsOf(spaceId))
      if (memberId === undefined || socket.memberId === memberId)
        closeSocket(socket, 4001, 'gone')
  }

  function advance(spaceId: string, space: Space) {
    space.seq += 1
    notify(spaceId)
    return space.seq
  }

  function sessionRoute(path: string, init: RequestInit | undefined) {
    if (path === 'sessions') {
      const body = JSON.parse(String(init?.body)) as { payload: string }
      const { accountPub } = JSON.parse(fromUtf8(fromB64u(body.payload))) as {
        accountPub: string
      }
      let accountId = [...accounts].find(
        ([, a]) => a.accountPub === accountPub
      )?.[0]
      if (!accountId) {
        accountId = toB64u(sha256(utf8(`fake|${accountPub}`)).slice(0, 16))
        accounts.set(accountId, { accountPub, suspended: false })
      }
      const sessionId = `session-${issued++}`
      const refreshToken = `refresh-${issued++}`
      sessions.set(sessionId, { accountId, refreshToken })
      const accessToken = `access-${issued++}`
      accessTokens.set(accessToken, { accountId, sessionId })
      return json(
        {
          ok: true,
          accountId,
          status: 'active',
          sessionId,
          accessToken,
          accessExpiresAt: now() + 15 * 60 * 1000,
          refreshToken,
          sessionExpiresAt: now() + 90 * 24 * 60 * 60 * 1000,
        },
        201
      )
    }
    if (path === 'sessions/refresh') {
      const { refreshToken } = JSON.parse(String(init?.body)) as {
        refreshToken: string
      }
      const found = [...sessions].find(
        ([, s]) => s.refreshToken === refreshToken
      )
      if (!found) return fail(401, 'unauthorized')
      const [sessionId, session] = found
      session.refreshToken = `refresh-${issued++}`
      const accessToken = `access-${issued++}`
      accessTokens.set(accessToken, { accountId: session.accountId, sessionId })
      return ok({
        accessToken,
        accessExpiresAt: now() + 15 * 60 * 1000,
        refreshToken: session.refreshToken,
        sessionExpiresAt: now() + 90 * 24 * 60 * 60 * 1000,
      })
    }
    return fail(404, 'not_found')
  }

  const headersOf = (init: RequestInit | undefined): Record<string, string> =>
    Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(
        ([name, value]) => [name.toLowerCase(), value]
      )
    )

  function caller(authorization: string | undefined): string | Response {
    if (!authorization?.startsWith('Bearer ')) return fail(401, 'unauthorized')
    const access = accessTokens.get(authorization.slice('Bearer '.length))
    return access ? access.accountId : fail(401, 'unauthorized')
  }

  function memberOf(fields: {
    spaceId?: unknown
    memberId?: unknown
    token?: unknown
  }): { space: Space; memberId: string } | Response {
    const { spaceId, memberId, token } = fields
    if (
      typeof spaceId !== 'string' ||
      typeof memberId !== 'string' ||
      typeof token !== 'string'
    )
      return fail(400, 'bad_request')
    const space = spaces.get(spaceId)
    const member = space?.members.get(memberId)
    if (!space || !member) return fail(410, 'gone')
    if (member.tokenHash !== hashB64u(token)) return fail(403, 'forbidden')
    return { space, memberId }
  }

  const openInvites = (space: Space) =>
    [...space.invites].filter(
      ([, invite]) => !invite.joined && invite.expiresAt > now()
    )

  function releaseHold(space: Space, inviteId: string) {
    for (const [scopeId, holder] of space.holders)
      if (holder.inviteId === inviteId && holder.memberId === null)
        space.holders.delete(scopeId)
  }

  function prune(space: Space, spaceId?: string) {
    let released = false
    for (const [inviteId, invite] of space.invites)
      if (invite.expiresAt <= now()) {
        space.invites.delete(inviteId)
        if (invite.handoff && !invite.joined) {
          releaseHold(space, inviteId)
          released = true
        }
      }
    for (const [inviteId, expiresAt] of space.closedInvites)
      if (expiresAt <= now()) space.closedInvites.delete(inviteId)
    if (released && spaceId !== undefined) advance(spaceId, space)
  }

  function closeInvite(space: Space, inviteId: string) {
    const invite = space.invites.get(inviteId)
    if (!invite) return
    space.invites.delete(inviteId)
    space.closedInvites.set(inviteId, invite.expiresAt)
    releaseHold(space, inviteId)
  }

  const liveLink = (link: Link) =>
    link.endedAt === null && link.expiresAt > now()

  function viewOf(space: Space): ScopedSpaceView {
    return {
      ownerId: space.ownerId,
      members: [...space.members].map(([memberId, member]) => ({
        memberId,
        scopes: member.scopes,
        invitedBy: member.invitedBy,
      })),
      invites: [...space.inviteLog].map(([inviteId, invite]) => ({
        inviteId,
        ...invite,
      })),
      holders: [...space.holders].map(([scopeId, holder]) => ({
        scopeId,
        memberId: holder.memberId,
        inviteId: holder.inviteId,
      })),
      links: [...space.links].map(([linkId, link]) => ({
        linkId,
        createdBy: link.createdBy,
        scopes: link.scopes,
        expiresAt: link.expiresAt,
        endedAt: link.endedAt,
      })),
    }
  }

  function detachMember(spaceId: string, space: Space, memberId: string) {
    space.members.delete(memberId)
    for (const [inviteId, invite] of space.invites)
      if (invite.invitedBy === memberId && !invite.joined)
        closeInvite(space, inviteId)
    closeSockets(spaceId, memberId)
  }

  function endHold(spaceId: string, space: Space, scopeId: string): boolean {
    const hold = space.holders.get(scopeId)
    if (!hold) return false
    space.holders.delete(scopeId)
    if (hold.inviteId !== null) closeInvite(space, hold.inviteId)
    const holderId = hold.memberId
    if (holderId === null) return true
    const removed: string[] = []
    for (const [memberId, member] of space.members) {
      const affected =
        memberId === holderId ||
        (member.invitedBy === holderId && member.scopes !== null)
      if (!affected || member.scopes === null) continue
      member.scopes = member.scopes.filter((id) => id !== scopeId)
      if (member.scopes.length === 0) removed.push(memberId)
    }
    for (const [inviteId, invite] of space.invites)
      if (
        invite.invitedBy === holderId &&
        !invite.joined &&
        invite.scopes?.includes(scopeId)
      )
        closeInvite(space, inviteId)
    for (const link of space.links.values())
      if (
        link.createdBy === holderId &&
        link.endedAt === null &&
        link.scopes.includes(scopeId)
      )
        link.endedAt = now()
    for (const memberId of removed) detachMember(spaceId, space, memberId)
    if (removed.length > 0) {
      closeOpenInvites(space)
      space.rekeyNeeded = true
    }
    return true
  }

  function closeOpenInvites(space: Space) {
    for (const [inviteId, invite] of space.invites)
      if (!invite.joined) closeInvite(space, inviteId)
  }

  const membersByJoining = (space: Space) =>
    [...space.members].sort(
      ([a, x], [b, y]) => x.joinedAt - y.joinedAt || a.localeCompare(b)
    )

  function wipe(spaceId: string) {
    spaces.delete(spaceId)
    deleted.add(spaceId)
    closeSockets(spaceId)
  }

  function dropMember(spaceId: string, space: Space, memberId: string) {
    if (space.mode === 'scoped')
      for (const [scopeId, holder] of [...space.holders])
        if (holder.memberId === memberId) endHold(spaceId, space, scopeId)
    if (!space.members.has(memberId)) {
      advance(spaceId, space)
      return
    }
    space.members.delete(memberId)
    if (space.mode === 'scoped')
      for (const link of space.links.values())
        if (link.createdBy === memberId && link.endedAt === null)
          link.endedAt = now()
    if (space.members.size === 0) {
      wipe(spaceId)
      return
    }
    for (const [inviteId, invite] of space.invites)
      if (invite.invitedBy === memberId && !invite.joined)
        closeInvite(space, inviteId)
    if (space.ownerId === memberId)
      space.ownerId = membersByJoining(space)[0][0]
    space.rekeyNeeded = true
    closeSockets(spaceId, memberId)
    advance(spaceId, space)
  }

  const listedMembers = (spaceId: string, space: Space) => [
    ...membersByJoining(space).map(([id, member]) => ({
      memberId: id,
      dhPub: forgedKeys.get(id) ?? member.dhPub,
      joinedAt: member.joinedAt,
      ...(space.mode === 'scoped' && {
        scopes: member.scopes,
        invitedBy: member.invitedBy,
      }),
    })),
    ...[...(phantoms.get(spaceId) ?? [])].map(([id, phantom]) => ({
      memberId: id,
      ...phantom,
      ...(space.mode === 'scoped' && { scopes: null, invitedBy: null }),
    })),
  ]

  function scopedFields(space: Space, memberId: string) {
    const view = viewOf(space)
    const isOwner = memberId === space.ownerId
    const seesAll = isOwner || space.members.get(memberId)?.scopes === null
    return {
      mode: 'scoped',
      invites: openInvites(space)
        .filter(([, invite]) => seesAll || invite.invitedBy === memberId)
        .sort(([, a], [, b]) => a.createdAt - b.createdAt)
        .map(([inviteId, invite]) => ({
          inviteId,
          invitedBy: invite.invitedBy,
          expiresAt: invite.expiresAt,
          scopes: invite.scopes,
          handoff: invite.handoff,
        })),
      holders: [...space.holders].map(([scopeId, holder]) => ({
        scopeId,
        ...holder,
      })),
      links: [...space.links]
        .filter(
          ([, link]) =>
            (seesAll || link.createdBy === memberId) &&
            link.expiresAt + LINK_LISTED_AFTER_EXPIRY_MS > now()
        )
        .map(([linkId, link]) => ({
          linkId,
          createdBy: link.createdBy,
          scopes: link.scopes,
          createdAt: link.createdAt,
          expiresAt: link.expiresAt,
          endedAt: link.endedAt,
        })),
      view,
    }
  }

  function recordsPage(
    space: Space,
    since: number,
    limit: number,
    readable: (recordId: string) => boolean
  ) {
    const after = [...space.records]
      .filter(([recordId, record]) => record.seq > since && readable(recordId))
      .sort(([, a], [, b]) => a.seq - b.seq)
    const page: [string, StoredRecord][] = []
    let chars = 0
    let more = false
    for (const entry of after) {
      if (
        page.length === limit ||
        (page.length > 0 && chars + entry[1].blob.length > SYNC_CHARS)
      ) {
        more = true
        break
      }
      page.push(entry)
      chars += entry[1].blob.length
    }
    return {
      seq: more ? page[page.length - 1][1].seq : space.seq,
      records: page.map(([recordId, { blobHash: _hash, ...record }]) => ({
        recordId,
        ...record,
      })),
      more,
    }
  }

  function syncPage(
    spaceId: string,
    space: Space,
    memberId: string,
    since: number,
    limit = pageRecords
  ) {
    const scoped =
      space.mode === 'scoped' ? scopedFields(space, memberId) : null
    const actor: ScopedActor = { memberId }
    const { seq, records, more } = recordsPage(
      space,
      since,
      limit,
      scoped
        ? (recordId) => mayReadRecord(scoped.view, actor, recordId)
        : () => true
    )
    const planted = plantedWraps.get(spaceId)?.get(memberId)
    return {
      seq,
      epoch: planted?.epoch ?? space.epoch,
      wrap: planted?.wrap ?? space.members.get(memberId)!.wrap,
      ownerId: space.ownerId,
      members: listedMembers(spaceId, space),
      invites: openInvites(space)
        .sort(([, a], [, b]) => a.createdAt - b.createdAt)
        .map(([inviteId, invite]) => ({
          inviteId,
          invitedBy: invite.invitedBy,
          expiresAt: invite.expiresAt,
        })),
      rekeyNeeded: space.rekeyNeeded,
      records,
      more,
      ...(scoped && {
        mode: scoped.mode,
        invites: scoped.invites,
        holders: scoped.holders,
        links: scoped.links,
      }),
    }
  }

  const badStamps = (records: PutRecordBody[]) =>
    records.some(
      (record) =>
        !Number.isSafeInteger(record.stamp) ||
        !Number.isSafeInteger(record.epoch) ||
        record.stamp > now() + STAMP_AHEAD_MS
    )

  const blobsOver = (records: PutRecordBody[], max: number) =>
    records.some((record) => fromB64u(record.blob).length > max)

  function put(
    spaceId: string,
    space: Space,
    memberId: string,
    records: PutRecordBody[]
  ) {
    if (!Array.isArray(records) || records.length < 1)
      return fail(400, 'bad_request')
    if (records.length > PUT_RECORDS) return fail(413, 'too_large')

    if (badStamps(records)) return fail(400, 'bad_request')
    if (
      space.mode === 'scoped' &&
      records.some((record) => !isScopedRecordId(record.recordId))
    )
      return fail(400, 'bad_request')
    if (blobsOver(records, BLOB_MAX)) return fail(413, 'too_large')

    const reserved = (recordId: string) =>
      (recordId.startsWith('m.') && recordId !== `m.${memberId}`) ||
      (recordId.startsWith('k.') && space.ownerId !== memberId)
    if (space.mode === 'scoped') {
      const view = viewOf(space)
      if (
        records.some(
          (record) => !mayWriteRecord(view, { memberId }, record.recordId)
        )
      )
        return fail(403, 'forbidden')
    } else if (records.some((record) => reserved(record.recordId)))
      return fail(403, 'forbidden')
    return store(spaceId, space, records)
  }

  function store(spaceId: string, space: Space, records: PutRecordBody[]) {
    if (records.some((record) => record.epoch !== space.epoch))
      return fail(409, 'stale_key')
    const added = new Set(
      records
        .map((record) => record.recordId)
        .filter((recordId) => !space.records.has(recordId))
    ).size
    if (space.records.size + added > MAX_RECORDS) return fail(429, 'limit')
    const before = space.seq
    const results = records.map((record) => {
      const held = space.records.get(record.recordId)
      const deletedFlag = record.deleted === true
      const hash = blobHash(record.blob)
      const verdict = !held
        ? 'newer'
        : record.stamp !== held.stamp
          ? record.stamp > held.stamp
            ? 'newer'
            : 'older'
          : deletedFlag !== held.deleted
            ? deletedFlag
              ? 'newer'
              : 'older'
            : hash === held.blobHash
              ? 'same'
              : hash < held.blobHash
                ? 'newer'
                : 'older'
      if (verdict === 'newer') {
        space.seq += 1
        space.records.set(record.recordId, {
          epoch: record.epoch,
          stamp: record.stamp,
          deleted: deletedFlag,
          blob: record.blob,
          blobHash: hash,
          seq: space.seq,
        })
      }
      return { recordId: record.recordId, stored: verdict !== 'older' }
    })

    if (space.seq !== before) notify(spaceId)
    return ok({ seq: space.seq, results })
  }

  const withinDay = (times: number[]) =>
    times.filter((at) => at > now() - DAY_MS)

  function scopedOp(
    op: string,
    body: Record<string, unknown>,
    spaceId: string,
    space: Space,
    memberId: string
  ): Response | null {
    const view = viewOf(space)
    switch (op) {
      case 'invite/create': {
        const { scopes, handoff } = body
        if (
          (scopes !== undefined &&
            !validScopeList(scopes, SCOPED_LIMITS.scopesPerInvite)) ||
          (handoff !== undefined && typeof handoff !== 'boolean') ||
          (handoff === true && (scopes as unknown[] | undefined)?.length !== 1)
        )
          return fail(400, 'bad_request')
        return null
      }
      case 'leave':
        return refuse(checkLeave(view, memberId))
      case 'member/remove': {
        const removeId = body.removeId as string
        const refused = refuse(checkMemberRemove(view, memberId, removeId))
        if (refused) return refused
        phantoms.get(spaceId)?.delete(removeId)
        if (space.members.has(removeId)) {
          closeOpenInvites(space)
          dropMember(spaceId, space, removeId)
        }
        return ok()
      }
      case 'member/scopes': {
        const { target, scopes } = body as {
          target: string
          scopes: string[] | null
        }
        if (typeof target !== 'string' || scopes === undefined)
          return fail(400, 'bad_request')
        const refused = refuse(
          checkMemberScopes(view, memberId, { target, scopes })
        )
        if (refused) return refused
        const member = space.members.get(target)!
        const narrowed =
          scopes !== null &&
          (member.scopes === null ||
            member.scopes.some((scopeId) => !scopes.includes(scopeId)))
        member.scopes = scopes && [...scopes]
        if (narrowed) space.rekeyNeeded = true
        advance(spaceId, space)
        return ok()
      }
      case 'handoff/create': {
        const { scopeId, target } = body as { scopeId: string; target: string }
        const refused = refuse(
          checkHandoffCreate(view, memberId, { scopeId, target })
        )
        if (refused) return refused
        const member = space.members.get(target)!
        if (member.scopes !== null && !member.scopes.includes(scopeId))
          member.scopes = [...member.scopes, scopeId]
        space.holders.set(scopeId, {
          memberId: target,
          inviteId: null,
          since: now(),
        })
        return ok({ seq: advance(spaceId, space) })
      }
      case 'handoff/end': {
        const scopeId = body.scopeId as string
        const refused = refuse(checkHandoffEnd(view, memberId, scopeId))
        if (refused) return refused
        return ok({
          seq: endHold(spaceId, space, scopeId)
            ? advance(spaceId, space)
            : space.seq,
        })
      }
      case 'link/create': {
        const { linkId, verifier, scopes, expiresAt, epoch } = body as {
          linkId: string
          verifier: string
          scopes: string[]
          expiresAt: number
          epoch: number
        }
        if (
          !isLinkId(linkId) ||
          typeof verifier !== 'string' ||
          !KEY_PATTERN.test(verifier) ||
          !validScopeList(scopes, SCOPED_LIMITS.scopesPerLink) ||
          !Number.isSafeInteger(expiresAt) ||
          expiresAt <= now() ||
          expiresAt >
            now() +
              SCOPED_LIMITS.maxLinkLifetimeMs +
              SCOPED_LIMITS.linkLifetimeSlackMs ||
          !Number.isSafeInteger(epoch) ||
          epoch < 1
        )
          return fail(400, 'bad_request')
        const existing = space.links.get(linkId)
        if (existing)
          return existing.createdBy === memberId &&
            existing.verifier === verifier &&
            existing.expiresAt === expiresAt &&
            JSON.stringify(existing.scopes) === JSON.stringify(scopes)
            ? ok({ seq: space.seq })
            : fail(409, 'conflict')
        const refused = refuse(checkLinkCreate(view, memberId, scopes))
        if (refused) return refused
        if (epoch !== space.epoch) return fail(409, 'stale_key')
        space.linksCreated = withinDay(space.linksCreated)
        const open = [...space.links.values()].filter(liveLink).length
        if (
          open >= SCOPED_LIMITS.openLinks ||
          space.linksCreated.length >= SCOPED_LIMITS.linksPerDay
        )
          return fail(429, 'limit')
        space.linksCreated.push(now())
        space.links.set(linkId, {
          createdBy: memberId,
          verifier,
          scopes: [...scopes],
          createdAt: now(),
          expiresAt,
          endedAt: null,
          epoch,
          syncs: [],
          puts: [],
          stored: [],
        })
        return ok({ seq: advance(spaceId, space) })
      }
      case 'link/end': {
        const linkId = body.linkId as string
        const refused = refuse(checkLinkEnd(view, memberId, linkId, now()))
        if (refused) return refused
        const link = space.links.get(linkId)
        if (!link || !liveLink(link)) return ok({ seq: space.seq })
        link.endedAt = now()
        return ok({ seq: advance(spaceId, space) })
      }
      case 'link/expiry': {
        const linkId = body.linkId as string
        const expiresAt = body.expiresAt as number
        if (
          !Number.isSafeInteger(expiresAt) ||
          expiresAt <= now() ||
          expiresAt >
            now() +
              SCOPED_LIMITS.maxLinkLifetimeMs +
              SCOPED_LIMITS.linkLifetimeSlackMs
        )
          return fail(400, 'bad_request')
        const link = space.links.get(linkId)
        if (!link || !liveLink(link)) return fail(404, 'not_found')
        const refused = refuse(checkLinkEnd(view, memberId, linkId, now()))
        if (refused) return refused
        if (link.expiresAt === expiresAt) return ok({ seq: space.seq })
        link.expiresAt = expiresAt
        return ok({ seq: advance(spaceId, space) })
      }
    }
    return null
  }

  function guestLink(
    body: Record<string, unknown>
  ): { spaceId: string; space: Space; linkId: string; link: Link } | Response {
    const { spaceId, linkId, linkToken } = body
    if (
      typeof spaceId !== 'string' ||
      !ID_PATTERN.test(spaceId) ||
      !isLinkId(linkId) ||
      typeof linkToken !== 'string' ||
      !KEY_PATTERN.test(linkToken)
    )
      return fail(400, 'bad_request')
    if (deleted.has(spaceId))
      return fail(410, 'gone', undefined, { reason: 'ended' })
    const space = spaces.get(spaceId)
    const link = space?.mode === 'scoped' ? space.links.get(linkId) : undefined
    if (!space || !link || hashB64u(linkToken) !== link.verifier)
      return fail(404, 'not_found')
    if (link.endedAt !== null)
      return fail(410, 'gone', undefined, { reason: 'ended' })
    if (link.expiresAt <= now())
      return fail(410, 'gone', undefined, { reason: 'expired' })
    return { spaceId, space, linkId, link }
  }

  const recent = (times: number[]) =>
    times.filter((at) => at > now() - MINUTE_MS)

  function handleGuest(op: string, text: string): Response {
    const refusal = state.refusals.findIndex(([name]) => name === op)
    if (refusal >= 0) {
      const [, status, code, retryAfter] = state.refusals.splice(refusal, 1)[0]
      return fail(status, code, retryAfter)
    }
    if (!state.enabled || !state.guests) return fail(503, 'disabled', 60)
    if (text.length > GUEST_BODY_CHARS) return fail(413, 'too_large')
    let body: Record<string, unknown>
    try {
      body = JSON.parse(text) as Record<string, unknown>
    } catch {
      return fail(400, 'bad_request')
    }
    if (op === 'guest/sync') {
      const { since, limit } = body
      if (
        !Number.isSafeInteger(since) ||
        (since as number) < 0 ||
        (limit !== undefined &&
          (!Number.isSafeInteger(limit) ||
            (limit as number) < 1 ||
            (limit as number) > GUEST_SYNC_RECORDS))
      )
        return fail(400, 'bad_request')
    } else if (op === 'guest/put') {
      const { records } = body
      if (!Array.isArray(records) || records.length < 1)
        return fail(400, 'bad_request')
      if (records.length > GUEST_PUT_RECORDS) return fail(413, 'too_large')
      if (
        badStamps(records as PutRecordBody[]) ||
        (records as PutRecordBody[]).some(
          (record) =>
            typeof record?.recordId !== 'string' ||
            typeof record.blob !== 'string' ||
            !isScopedRecordId(record.recordId)
        )
      )
        return fail(400, 'bad_request')
    } else return fail(404, 'not_found')
    const found = guestLink(body)
    if (found instanceof Response) return found
    const { spaceId, space, link } = found
    prune(space, spaceId)
    link.syncs = recent(link.syncs)
    link.puts = recent(link.puts)
    link.stored = link.stored.filter(({ at }) => at > now() - DAY_MS)
    const actor: ScopedActor = {
      guest: {
        linkId: found.linkId,
        createdBy: link.createdBy,
        scopes: link.scopes,
        expiresAt: link.expiresAt,
        endedAt: link.endedAt,
      },
    }
    const view = viewOf(space)
    const date = { date: new Date(now()).toUTCString() }

    if (op === 'guest/sync') {
      if (link.syncs.length >= GUEST_SYNCS_PER_MINUTE)
        return fail(429, 'rate_limited', 60)
      link.syncs.push(now())
      const page = recordsPage(
        space,
        body.since as number,
        Math.min(
          (body.limit as number | undefined) ?? GUEST_SYNC_RECORDS,
          GUEST_SYNC_RECORDS
        ),
        (recordId) => mayReadRecord(view, actor, recordId)
      )
      return json(
        { ok: true, ...page, epoch: space.epoch, expiresAt: link.expiresAt },
        200,
        date
      )
    }

    const records = body.records as PutRecordBody[]
    const storedToday = link.stored.reduce((sum, { count }) => sum + count, 0)
    if (
      link.puts.length >= GUEST_PUTS_PER_MINUTE ||
      storedToday + records.length > GUEST_RECORDS_PER_DAY
    )
      return fail(429, 'rate_limited', 60)
    link.puts.push(now())
    if (
      records.some(
        (record) =>
          parseScopedRecordId(record.recordId)?.class === 'street' ||
          !mayWriteRecord(view, actor, record.recordId)
      )
    )
      return fail(403, 'forbidden')
    if (blobsOver(records, GUEST_BLOB_MAX)) return fail(413, 'too_large')
    const answer = store(spaceId, space, records)
    if (answer.ok) link.stored.push({ at: now(), count: records.length })
    const headers = new Headers(answer.headers)
    headers.set('date', date.date)
    return new Response(answer.body, { status: answer.status, headers })
  }

  function handle(
    op: string,
    body: Record<string, unknown>,
    account: string
  ): Response {
    const refusal = state.refusals.findIndex(([name]) => name === op)
    if (refusal >= 0) {
      const [, status, code, retryAfter] = state.refusals.splice(refusal, 1)[0]
      return fail(status, code, retryAfter)
    }
    if (!state.enabled && !WHILE_DISABLED.has(op))
      return fail(503, 'disabled', 60)
    if (accounts.get(account)?.suspended && REFUSED_WHILE_SUSPENDED.has(op))
      return fail(403, 'suspended')

    if (op === 'create') {
      const { spaceId, memberId, dhPub, tokenHash, wrap } = body as Record<
        string,
        string
      >
      const mode = body.mode === undefined ? null : body.mode
      if (
        (mode !== null && mode !== 'scoped') ||
        typeof spaceId !== 'string' ||
        typeof wrap !== 'string' ||
        typeof tokenHash !== 'string' ||
        !memberOwnsKey(spaceId, memberId, dhPub)
      )
        return fail(400, 'bad_request')
      if (deleted.has(spaceId)) return fail(410, 'gone')
      const existing = spaces.get(spaceId)
      if (existing) {
        const same =
          existing.seq === 1 &&
          existing.created.memberId === memberId &&
          existing.created.dhPub === dhPub &&
          existing.created.tokenHash === tokenHash &&
          existing.created.wrap === wrap &&
          existing.created.mode === mode
        return same
          ? ok({ seq: 1, joinedAt: existing.members.get(memberId)!.joinedAt })
          : fail(409, 'conflict')
      }
      const count = state.created.get(account) ?? 0
      if (count >= SPACES_PER_DAY) return fail(429, 'limit')
      state.created.set(account, count + 1)
      const joinedAt = now()
      spaces.set(spaceId, {
        mode,
        holders: new Map(),
        inviteLog: new Map(),
        links: new Map(),
        linksCreated: [],
        seq: 1,
        epoch: 1,
        ownerId: memberId,
        members: new Map([
          [
            memberId,
            { tokenHash, dhPub, joinedAt, wrap, scopes: null, invitedBy: null },
          ],
        ]),
        invites: new Map(),
        closedInvites: new Map(),
        records: new Map(),
        rekeyNeeded: false,
        created: { memberId, dhPub, tokenHash, wrap, mode },
      })
      return ok({ seq: 1, joinedAt })
    }

    if (op === 'join') {
      const {
        spaceId,
        inviteId,
        joinSecret,
        memberId,
        dhPub,
        tokenHash,
        wrap,
      } = body as Record<string, string>
      const { epoch } = body as { epoch: unknown }
      if (
        typeof spaceId !== 'string' ||
        typeof inviteId !== 'string' ||
        typeof joinSecret !== 'string' ||
        typeof tokenHash !== 'string' ||
        typeof wrap !== 'string' ||
        !Number.isSafeInteger(epoch) ||
        (epoch as number) < 1 ||
        !memberOwnsKey(spaceId, memberId, dhPub)
      )
        return fail(400, 'bad_request')
      if (deleted.has(spaceId)) return fail(410, 'gone')
      const space = spaces.get(spaceId)
      if (!space) return fail(404, 'not_found')
      prune(space, space.mode === 'scoped' ? spaceId : undefined)
      const invite = space.invites.get(inviteId)
      if (!invite) return fail(404, 'not_found')
      const secretMatches = hashB64u(joinSecret) === invite.verifier
      const member = space.members.get(memberId)
      if (invite.joined) {
        const retry =
          secretMatches &&
          invite.joined.memberId === memberId &&
          invite.joined.dhPub === dhPub &&
          invite.joined.tokenHash === tokenHash &&
          member?.tokenHash === tokenHash
        if (retry)
          return ok({
            seq: space.seq,
            epoch: space.epoch,
            joinedAt: member.joinedAt,
          })
        return member ? fail(409, 'conflict') : fail(404, 'not_found')
      }
      if (!secretMatches) {
        invite.wrong += 1
        if (invite.wrong >= BAD_JOINS) {
          closeInvite(space, inviteId)
          advance(spaceId, space)
        }
        return fail(403, 'forbidden')
      }
      if (!space.members.has(invite.invitedBy)) return fail(404, 'not_found')
      if (member) return fail(409, 'conflict')

      if (epoch !== space.epoch) return fail(409, 'stale_key')

      if (space.members.size + openInvites(space).length > state.maxMembers)
        return fail(429, 'limit')
      const joinedAt = now()
      const scoped = space.mode === 'scoped'
      space.members.set(memberId, {
        tokenHash,
        dhPub,
        joinedAt,
        wrap,
        scopes: scoped ? invite.scopes : null,
        invitedBy: scoped ? invite.invitedBy : null,
      })
      invite.joined = { memberId, dhPub, tokenHash }
      if (scoped && invite.handoff && invite.scopes)
        space.holders.set(invite.scopes[0], {
          memberId,
          inviteId: null,
          since: joinedAt,
        })
      const seq = advance(spaceId, space)
      return ok({ seq, epoch: space.epoch, joinedAt })
    }

    const found = memberOf(body)
    if (found instanceof Response) return found
    const { space, memberId } = found
    const spaceId = body.spaceId as string
    const isOwner = space.ownerId === memberId

    if (space.mode === 'scoped') {
      prune(space, spaceId)
      const answer = scopedOp(op, body, spaceId, space, memberId)
      if (answer) return answer
    } else if (
      SCOPED_ONLY.has(op) ||
      (op === 'invite/create' &&
        (body.scopes !== undefined || body.handoff !== undefined))
    )
      return fail(400, 'bad_request')

    switch (op) {
      case 'sync': {
        prune(space)
        const since = body.since as number
        const limit = body.limit as number | undefined
        if (!Number.isSafeInteger(since) || since < 0)
          return fail(400, 'bad_request')
        return ok(
          syncPage(
            spaceId,
            space,
            memberId,
            since,
            Math.min(limit ?? pageRecords, pageRecords)
          )
        )
      }
      case 'put':
        return put(spaceId, space, memberId, body.records as PutRecordBody[])
      case 'invite/create': {
        const { inviteId, joinVerifier, expiresAt, epoch } = body as {
          inviteId: string
          joinVerifier: string
          expiresAt: number
          epoch: number
        }
        if (
          typeof inviteId !== 'string' ||
          typeof joinVerifier !== 'string' ||
          !Number.isSafeInteger(epoch) ||
          epoch < 1 ||
          !Number.isSafeInteger(expiresAt) ||
          expiresAt <= now() ||
          expiresAt > now() + INVITE_MAX_MS
        )
          return fail(400, 'bad_request')
        prune(space)
        if (epoch !== space.epoch) return fail(409, 'stale_key')

        if (space.closedInvites.has(inviteId)) return fail(409, 'conflict')
        const existing = space.invites.get(inviteId)
        if (existing)
          return !existing.joined &&
            existing.invitedBy === memberId &&
            existing.expiresAt === expiresAt &&
            existing.verifier === joinVerifier &&
            JSON.stringify(existing.scopes) ===
              JSON.stringify((body.scopes as unknown) ?? null) &&
            existing.handoff === (body.handoff === true)
            ? ok()
            : fail(409, 'conflict')
        const scoped = space.mode === 'scoped'
        const scopes = scoped
          ? ((body.scopes as string[] | undefined) ?? null)
          : null
        const handoff = scoped && body.handoff === true
        if (scoped) {
          const refused = refuse(
            checkShare(viewOf(space), memberId, { scopes, handoff })
          )
          if (refused) return refused
        }
        if (space.members.size + openInvites(space).length >= state.maxMembers)
          return fail(429, 'limit')
        space.invites.set(inviteId, {
          verifier: joinVerifier,
          expiresAt,
          invitedBy: memberId,
          createdAt: now(),
          wrong: 0,
          scopes,
          handoff,
        })
        if (scoped) {
          space.inviteLog.set(inviteId, {
            invitedBy: memberId,
            scopes,
            handoff,
          })
          if (handoff && scopes)
            space.holders.set(scopes[0], {
              memberId: null,
              inviteId,
              since: now(),
            })
        }
        advance(spaceId, space)
        return ok()
      }
      case 'invite/delete': {
        prune(space)
        const inviteId = body.inviteId as string
        const invite = space.invites.get(inviteId)
        if (!invite || invite.joined) return ok()
        if (invite.invitedBy !== memberId && !isOwner)
          return fail(403, 'forbidden')
        closeInvite(space, inviteId)
        advance(spaceId, space)
        return ok()
      }
      case 'leave':
        dropMember(spaceId, space, memberId)
        return ok()
      case 'member/remove': {
        if (!isOwner) return fail(403, 'forbidden')
        const removeId = body.removeId as string
        if (removeId === memberId) return fail(400, 'bad_request')
        phantoms.get(spaceId)?.delete(removeId)
        if (space.members.has(removeId)) {
          closeOpenInvites(space)
          dropMember(spaceId, space, removeId)
        }
        return ok()
      }
      case 'rekey': {
        const { epoch, wraps, link } = body as {
          epoch: number
          wraps: { memberId: string; wrap: string }[]
          link?: { stamp?: unknown; blob?: unknown }
        }
        if (
          !Number.isSafeInteger(epoch) ||
          epoch < 2 ||
          !Array.isArray(wraps) ||
          typeof link?.blob !== 'string' ||
          !Number.isSafeInteger(link.stamp) ||
          (link.stamp as number) < 0 ||
          (link.stamp as number) > now() + STAMP_AHEAD_MS
        )
          return fail(400, 'bad_request')
        if (fromB64u(link.blob).length > BLOB_MAX) return fail(413, 'too_large')
        if (!isOwner) return fail(403, 'forbidden')
        if (epoch !== space.epoch + 1) return fail(409, 'stale_key')
        const named = new Set(wraps.map((w) => w.memberId))
        if (named.size !== wraps.length) return fail(400, 'bad_request')

        const listed = new Set(
          listedMembers(spaceId, space).map((m) => m.memberId)
        )
        if (
          named.size !== listed.size ||
          [...named].some((id) => !listed.has(id))
        )
          return fail(409, 'conflict')
        const linkId = `k.${epoch}`
        if (!space.records.has(linkId) && space.records.size >= MAX_RECORDS)
          return fail(429, 'limit')
        for (const { memberId: id, wrap } of wraps) {
          const member = space.members.get(id)
          if (member) member.wrap = wrap
        }
        space.epoch = epoch
        space.rekeyNeeded = false
        closeOpenInvites(space)
        state.rekeys.push({ spaceId, epoch, memberIds: [...named] })
        const seq = advance(spaceId, space)

        space.records.set(linkId, {
          epoch,
          stamp: link.stamp as number,
          deleted: false,
          blob: link.blob,
          blobHash: blobHash(link.blob),
          seq,
        })
        return ok({ seq })
      }
      case 'delete':
        if (!isOwner) return fail(403, 'forbidden')
        wipe(spaceId)
        return ok()
    }
    return fail(404, 'not_found')
  }

  async function fetchImpl(url: string | URL | Request, init?: RequestInit) {
    const text = String(url)
    if (text.includes('/accounts/v1/'))
      return sessionRoute(text.split('/accounts/v1/')[1], init)
    const op = text.split('/spaces/v1/')[1]
    state.log.push(op)
    if (op.startsWith('guest/'))
      return handleGuest(op, String(init?.body ?? '{}'))
    const account = caller(headersOf(init).authorization)
    if (account instanceof Response) return account
    return handle(
      op,
      JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      account
    )
  }

  function admitSocket(
    headers: Record<string, string>
  ): { space: Space; spaceId: string; memberId: string } | null {
    const refused = state.refusedSockets.shift()
    if (refused !== undefined) return null
    if (!state.enabled) return null
    const account = caller(headers.authorization)
    if (account instanceof Response) return null
    let fields: { spaceId?: unknown; memberId?: unknown }
    try {
      fields = JSON.parse(
        fromUtf8(fromB64u(headers[SPACE_LIVE_HEADERS.space] ?? ''))
      ) as typeof fields
    } catch {
      return null
    }

    if ('token' in fields) return null
    const found = memberOf({
      ...fields,
      token: headers[SPACE_LIVE_HEADERS.token],
    })
    if (found instanceof Response) return null
    return {
      space: found.space,
      spaceId: fields.spaceId as string,
      memberId: found.memberId,
    }
  }

  function openSocket(
    _url: string,
    headers: Record<string, string>
  ): LiveSocket {
    let closedEarly = false
    const socket: FakeLive = {
      spaceId: '',
      memberId: '',
      openedAt: 0,
      closed: false,
      send: (data) => {
        if (data === 'ping' && !socket.closed)
          socket.onmessage?.({ data: 'pong' })
      },
      close: (code = 1000) => {
        if (!socket.spaceId) {
          if (!androidSockets) closedEarly = true
          return
        }
        closeSocket(socket, code, '')
      },
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
    }
    setTimeout(() => {
      if (closedEarly) {
        socket.closed = true
        socket.onclose?.({ code: 1000 })
        return
      }
      const admitted = admitSocket(headers)
      if (!admitted) {
        socket.closed = true
        socket.onclose?.({ code: 1006 })
        return
      }
      socket.spaceId = admitted.spaceId
      socket.memberId = admitted.memberId
      socket.openedAt = state.socketsOpened++
      const others = openSocketsOf(admitted.spaceId).sort(
        (a, b) => a.openedAt - b.openedAt
      )
      sockets.add(socket)
      socket.onopen?.()
      socket.onmessage?.({
        data: JSON.stringify({ type: 'hello', seq: admitted.space.seq }),
      })
      const excess = others.length + 1 - SOCKETS_PER_PLACE * state.maxMembers
      for (const old of others.slice(0, Math.max(0, excess)))
        closeSocket(old, 4002, 'replaced')
    }, 0)
    return socket
  }

  return {
    fetchImpl: fetchImpl as typeof fetch,
    openSocket,
    state,
    spaces,

    expireAccessTokens: () => accessTokens.clear(),
    suspend: (suspended = true) => {
      for (const account of accounts.values()) account.suspended = suspended
    },

    refuseNext(
      op: string,
      status: number,
      code: string,
      retryAfterSeconds?: number
    ) {
      state.refusals.push([op, status, code, retryAfterSeconds])
    },

    refuseNextSocket(status = 401) {
      state.refusedSockets.push(status)
    },

    forgeMemberKey(memberId: string, dhPub: string) {
      forgedKeys.set(memberId, dhPub)
    },

    plantWrap(
      spaceId: string,
      memberId: string,
      key: Uint8Array,
      epoch?: number
    ) {
      const space = spaces.get(spaceId)!
      const at = epoch ?? space.epoch
      const random = (length: number) =>
        globalThis.crypto.getRandomValues(new Uint8Array(length))
      const wrap = wrapSpaceKey(
        key,
        space.members.get(memberId)!.dhPub,
        { spaceId, epoch: at, memberId },
        { ephemeral: random(32), nonce: random(24) }
      )
      const planted = plantedWraps.get(spaceId) ?? new Map()
      planted.set(memberId, { epoch: at, wrap })
      plantedWraps.set(spaceId, planted)
    },

    addPhantomMember(spaceId: string, dhPub: string): string {
      const memberId = memberIdFor(spaceId, dhPub)
      const listed = phantoms.get(spaceId) ?? new Map<string, Phantom>()
      listed.set(memberId, { dhPub, joinedAt: now() })
      phantoms.set(spaceId, listed)
      return memberId
    },

    plantRecord(spaceId: string, record: PutRecordBody) {
      const space = spaces.get(spaceId)!
      const seq = advance(spaceId, space)
      space.records.set(record.recordId, {
        epoch: record.epoch,
        stamp: record.stamp,
        deleted: record.deleted === true,
        blob: record.blob,
        blobHash: blobHash(record.blob),
        seq,
      })
    },

    forceRekeyNeeded(spaceId: string) {
      spaces.get(spaceId)!.rekeyNeeded = true
    },

    honest() {
      forgedKeys.clear()
      plantedWraps.clear()
      phantoms.clear()
    },

    closeLive(spaceId: string, code: number, memberId?: string) {
      for (const socket of openSocketsOf(spaceId))
        if (memberId === undefined || socket.memberId === memberId)
          closeSocket(socket, code, code === 4001 ? 'gone' : 'replaced')
    },
    openSockets: (spaceId?: string) =>
      [...sockets].filter(
        (socket) =>
          !socket.closed &&
          (spaceId === undefined || socket.spaceId === spaceId)
      ).length,

    isDeleted: (spaceId: string) => deleted.has(spaceId),
  }
}

export const FAKE_SPACES_URL = 'https://spaces.test'

export function fakeSpacesClient(
  server: FakeSpacesServer,
  {
    randomBytes,
    accountKey = randomBytes(32),
  }: {
    randomBytes: (length: number) => Uint8Array
    accountKey?: Uint8Array
  }
) {
  let stored: string | null = null
  const sessions = createAccountSessions({
    baseUrl: FAKE_SPACES_URL,
    now: Date.now,
    randomBytes,
    attestation: {
      assert: <T>(request: AttestedRequest<T>) =>
        request.submit({ kind: 'devBypass', token: 'fake' }),
    },
    store: {
      read: async () => stored,
      write: async (value) => {
        stored = value
      },
    },
    accountKey: async () => accountKey,
    fetchImpl: server.fetchImpl,
  })
  const client = createSpacesClient({
    baseUrl: FAKE_SPACES_URL,
    authorize: (run, { signal }) =>
      sessions.withSession(run, { accountKey, signal }),
    fetchImpl: server.fetchImpl,
    openSocket: server.openSocket,
  })
  return { client, sessions, accountKey }
}
