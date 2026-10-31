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

/**
 * An in-memory ww-api implementing docs/shared-cars-protocol.md closely enough
 * to exercise the client and the Shared Cars engine end to end, modeled on
 * ww-api's `SharedSpace` Durable Object: sessions, member tokens and the keys
 * their ids commit to, the newest-stamp rule (an identical resend is stored
 * with no new `seq`), reserved ids (`m.` and `k.` records only their member's
 * and the owner's), key epochs and `stale_key`, invites (made at the current
 * epoch, closed when their inviter goes, their ids never reused), joins at the
 * invitation's epoch and their retries, leaving and the owner's hand-off,
 * removal, rekeying, deletion (whose id stays `gone`), a `seq` that every
 * change advances, the switches (kill switch, suspension, refusals on demand)
 * and the live signal with its socket cap. Its clock can differ from the
 * devices'. It opens, refreshes and closes sessions at `/accounts/v1/sessions`
 * without checking an attestation. Not a substitute for ww-api's own tests;
 * rate limits are left out (`refuseNext` stands in).
 *
 * It can also play a server that turned against its users, as far as a blind
 * server can: wrap a key of its own to a member (`plantWrap`), list a member of
 * its own (`addPhantomMember`), ask for a rekey (`forceRekeyNeeded`), and hand
 * out a record version of its choosing (`plantRecord`).
 */

type Member = {
  tokenHash: string
  dhPub: string
  joinedAt: number
  /** The current epoch's wrap. */
  wrap: string
}

type Invite = {
  verifier: string
  expiresAt: number
  invitedBy: string
  createdAt: number
  wrong: number
  /** Set once used; kept until it expires, so a retried join is recognized. */
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

type Space = {
  seq: number
  epoch: number
  ownerId: string
  members: Map<string, Member>
  invites: Map<string, Invite>
  /**
   * Invites closed before they expired (deleted, burned, or closed by a
   * removal, a leave or a rekey), by id, with when they'd have expired: their
   * ids aren't taken again until then.
   */
  closedInvites: Map<string, number>
  records: Map<string, StoredRecord>
  rekeyNeeded: boolean
  /** What `create` was sent, for recognizing an identical retry. */
  created: { memberId: string; dhPub: string; tokenHash: string; wrap: string }
}

/** A member of the server's own, which only its `sync` lists. */
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
/** Live sockets each member place allows (40 at the default cap of 10). */
const SOCKETS_PER_PLACE = 4
/** Ops a switched-off service still takes, so people can always leave. */
const WHILE_DISABLED = new Set(['leave', 'member/remove', 'delete'])
/** Ops a suspended account can't make, because they reach other people. */
const REFUSED_WHILE_SUSPENDED = new Set([
  'create',
  'put',
  'invite/create',
  'join',
])

const hashB64u = (text: string) => toB64u(sha256(fromB64u(text)))
/** SHA-256 of the decoded blob, as hex, so strings compare as the bytes do. */
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
  /** The server's clock, which may differ from the devices'. */
  now: () => number
  maxMembers?: number
  /** The most records a `sync` page holds, the server's 1,000 by default. */
  pageRecords?: number
  /**
   * Sockets behave as React Native's do on Android: one closed while still
   * connecting opens anyway.
   */
  androidSockets?: boolean
}) {
  const spaces = new Map<string, Space>()
  /** Deleted spaces: their ids are `gone` for good. */
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
  /** `sync` lists this `dhPub` for a member instead of theirs. */
  const forgedKeys = new Map<string, string>()
  /** `sync` gives a member this epoch and wrap instead of theirs, by space. */
  const plantedWraps = new Map<
    string,
    Map<string, { epoch: number; wrap: string }>
  >()
  /** Members of the server's own, by space. */
  const phantoms = new Map<string, Map<string, Phantom>>()
  let issued = 0
  const state = {
    /** The kill switch (`spaces:enabled`). */
    enabled: true,
    /** Members plus open invites a space may hold (`spaces:maxMembers`). */
    maxMembers,
    /** Every op, by name only (no ids), for assertions. */
    log: [] as string[],
    /** The next refusals of an op: `[op, status, code, retryAfterSeconds?]`. */
    refusals: [] as [string, number, string, number?][],
    /** The next live upgrades to refuse, by HTTP status. */
    refusedSockets: [] as number[],
    /** Created space count per account, for the daily cap. */
    created: new Map<string, number>(),
    /** Sockets opened, ever. */
    socketsOpened: 0,
    /** Every rekey stored: its epoch, and whom it wrapped the new key to. */
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
  const fail = (status: number, code: string, retryAfter?: number) =>
    json(
      {
        ok: false,
        error: code,
        code,
        ...(retryAfter !== undefined && { retryAfter }),
      },
      status,
      retryAfter !== undefined ? { 'retry-after': String(retryAfter) } : {}
    )
  const ok = (body: Record<string, unknown> = {}) => json({ ok: true, ...body })

  const openSocketsOf = (spaceId: string) =>
    [...sockets].filter(
      (socket) => socket.spaceId === spaceId && !socket.closed
    )

  /** `changed` with the head to every socket on the space, the writer's too. */
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

  /** `4001 "gone"` to `memberId`'s sockets, or everyone's. */
  function closeSockets(spaceId: string, memberId?: string) {
    for (const socket of openSocketsOf(spaceId))
      if (memberId === undefined || socket.memberId === memberId)
        closeSocket(socket, 4001, 'gone')
  }

  /** Every change advances `seq`; the sockets hear it. */
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

  /** The account an `Authorization` header's token belongs to, or a refusal. */
  function caller(authorization: string | undefined): string | Response {
    if (!authorization?.startsWith('Bearer ')) return fail(401, 'unauthorized')
    const access = accessTokens.get(authorization.slice('Bearer '.length))
    return access ? access.accountId : fail(401, 'unauthorized')
  }

  /** The member a member op proves, or the refusal. */
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

  /** Expired invites go, used ones included: a retried join can't outlive them. */
  function prune(space: Space) {
    for (const [inviteId, invite] of space.invites)
      if (invite.expiresAt <= now()) space.invites.delete(inviteId)
    for (const [inviteId, expiresAt] of space.closedInvites)
      if (expiresAt <= now()) space.closedInvites.delete(inviteId)
  }

  /** Closes an invite before it expires: its id isn't taken again until then. */
  function closeInvite(space: Space, inviteId: string) {
    const invite = space.invites.get(inviteId)
    if (!invite) return
    space.invites.delete(inviteId)
    space.closedInvites.set(inviteId, invite.expiresAt)
  }

  /** Every open invite closes (a removal, a rekey). */
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

  /**
   * `memberId` goes (they left, or the owner removed them): their token hash
   * and wrap, and the invites they made that nobody used. The owner's place
   * passes to whoever joined first; the last one out deletes the space.
   */
  function dropMember(spaceId: string, space: Space, memberId: string) {
    space.members.delete(memberId)
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

  /** The space's members as `sync` lists them: phantoms too. */
  const listedMembers = (spaceId: string, space: Space) => [
    ...membersByJoining(space).map(([id, member]) => ({
      memberId: id,
      dhPub: forgedKeys.get(id) ?? member.dhPub,
      joinedAt: member.joinedAt,
    })),
    ...[...(phantoms.get(spaceId) ?? [])].map(([id, phantom]) => ({
      memberId: id,
      ...phantom,
    })),
  ]

  function syncPage(
    spaceId: string,
    space: Space,
    memberId: string,
    since: number,
    limit = pageRecords
  ) {
    const after = [...space.records]
      .filter(([, record]) => record.seq > since)
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
    const planted = plantedWraps.get(spaceId)?.get(memberId)
    return {
      seq: more ? page[page.length - 1][1].seq : space.seq,
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
      records: page.map(([recordId, { blobHash: _hash, ...record }]) => ({
        recordId,
        ...record,
      })),
      more,
    }
  }

  function put(
    spaceId: string,
    space: Space,
    memberId: string,
    records: PutRecordBody[]
  ) {
    if (!Array.isArray(records) || records.length < 1)
      return fail(400, 'bad_request')
    if (records.length > PUT_RECORDS) return fail(413, 'too_large')
    // The body is checked before the space: a stamp that isn't a whole
    // millisecond, or too far ahead, is malformed whatever its epoch.
    if (
      records.some(
        (record) =>
          !Number.isSafeInteger(record.stamp) ||
          !Number.isSafeInteger(record.epoch) ||
          record.stamp > now() + STAMP_AHEAD_MS
      )
    )
      return fail(400, 'bad_request')
    if (records.some((record) => fromB64u(record.blob).length > BLOB_MAX))
      return fail(413, 'too_large')
    // Another member's record, or a key chain link from anyone but the owner:
    // none of the put is stored.
    const reserved = (recordId: string) =>
      (recordId.startsWith('m.') && recordId !== `m.${memberId}`) ||
      (recordId.startsWith('k.') && space.ownerId !== memberId)
    if (records.some((record) => reserved(record.recordId)))
      return fail(403, 'forbidden')
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
    // A put that stores nothing sends no `changed`.
    if (space.seq !== before) notify(spaceId)
    return ok({ seq: space.seq, results })
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
      if (
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
          existing.created.wrap === wrap
        return same
          ? ok({ seq: 1, joinedAt: existing.members.get(memberId)!.joinedAt })
          : fail(409, 'conflict')
      }
      const count = state.created.get(account) ?? 0
      if (count >= SPACES_PER_DAY) return fail(429, 'limit')
      state.created.set(account, count + 1)
      const joinedAt = now()
      spaces.set(spaceId, {
        seq: 1,
        epoch: 1,
        ownerId: memberId,
        members: new Map([[memberId, { tokenHash, dhPub, joinedAt, wrap }]]),
        invites: new Map(),
        closedInvites: new Map(),
        records: new Map(),
        rekeyNeeded: false,
        created: { memberId, dhPub, tokenHash, wrap },
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
      prune(space)
      const invite = space.invites.get(inviteId)
      if (!invite) return fail(404, 'not_found')
      const secretMatches = hashB64u(joinSecret) === invite.verifier
      const member = space.members.get(memberId)
      if (invite.joined) {
        // A retry is recognized whatever its epoch, and answered with the
        // current one.
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
      // Nobody joins with a key for another epoch.
      if (epoch !== space.epoch) return fail(409, 'stale_key')
      // The invite already holds a place; a lowered cap still applies.
      if (space.members.size + openInvites(space).length > state.maxMembers)
        return fail(429, 'limit')
      const joinedAt = now()
      space.members.set(memberId, { tokenHash, dhPub, joinedAt, wrap })
      invite.joined = { memberId, dhPub, tokenHash }
      const seq = advance(spaceId, space)
      return ok({ seq, epoch: space.epoch, joinedAt })
    }

    const found = memberOf(body)
    if (found instanceof Response) return found
    const { space, memberId } = found
    const spaceId = body.spaceId as string
    const isOwner = space.ownerId === memberId

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
        // An id closed before it expired isn't taken again.
        if (space.closedInvites.has(inviteId)) return fail(409, 'conflict')
        const existing = space.invites.get(inviteId)
        if (existing)
          return !existing.joined &&
            existing.invitedBy === memberId &&
            existing.expiresAt === expiresAt &&
            existing.verifier === joinVerifier
            ? ok()
            : fail(409, 'conflict')
        if (space.members.size + openInvites(space).length >= state.maxMembers)
          return fail(429, 'limit')
        space.invites.set(inviteId, {
          verifier: joinVerifier,
          expiresAt,
          invitedBy: memberId,
          createdAt: now(),
          wrong: 0,
        })
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
          // Every open invite closes, so they can't come back through
          // another member's before the rekey.
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
        // The members it lists, its own included: that's whom it asks for.
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
        // The link replaces any version of it, so one planted ahead can't
        // block it.
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
    const account = caller(headersOf(init).authorization)
    if (account instanceof Response) return account
    return handle(
      op,
      JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      account
    )
  }

  /**
   * Whether a live upgrade would be taken, and as whom: the session, the kill
   * switch, the headers, and the member's token.
   */
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
    // The token never rides in `x-ww-space-auth`.
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

  /** The live signal, as React Native's WebSocket would open it. */
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
          // Still connecting: Android opens it anyway.
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
        // A refused upgrade: React Native says only that it closed.
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
    /** Every access token stops working: the next calls refresh. */
    expireAccessTokens: () => accessTokens.clear(),
    suspend: (suspended = true) => {
      for (const account of accounts.values()) account.suspended = suspended
    },
    /** The next `op` is refused with `code` (and a Retry-After, if given). */
    refuseNext(
      op: string,
      status: number,
      code: string,
      retryAfterSeconds?: number
    ) {
      state.refusals.push([op, status, code, retryAfterSeconds])
    },
    /** The next live upgrade is refused (React Native sees only a close). */
    refuseNextSocket(status = 401) {
      state.refusedSockets.push(status)
    },
    /**
     * `sync` lists `dhPub` as `memberId`'s key from now on: a server (or
     * whoever controls it) trying to swap in a key of its own.
     */
    forgeMemberKey(memberId: string, dhPub: string) {
      forgedKeys.set(memberId, dhPub)
    },
    /**
     * `sync` gives `memberId` a wrap of `key`, a key the server chose, for
     * `epoch` (the space's own when absent) from now on, as any server could: a
     * wrap is made from public values.
     */
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
    /**
     * `sync` lists a member of the server's own on `spaceId`, with `dhPub` (a
     * key it holds) and the id that commits to it. Returns that id.
     */
    addPhantomMember(spaceId: string, dhPub: string): string {
      const memberId = memberIdFor(spaceId, dhPub)
      const listed = phantoms.get(spaceId) ?? new Map<string, Phantom>()
      listed.set(memberId, { dhPub, joinedAt: now() })
      phantoms.set(spaceId, listed)
      return memberId
    },
    /**
     * Stores `record` as the space's newest version of it, past every rule (who
     * may put it, its epoch, its stamp): a version the server made up, or an
     * older one it kept.
     */
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
    /** `sync` says the space needs a new key, as if someone had gone. */
    forceRekeyNeeded(spaceId: string) {
      spaces.get(spaceId)!.rekeyNeeded = true
    },
    /** The server tells the truth again: no planted wraps or phantoms. */
    honest() {
      forgedKeys.clear()
      plantedWraps.clear()
      phantoms.clear()
    },
    /**
     * Closes the space's live sockets (one member's, with `memberId`) with
     * `code`, as the server does on `4001 "gone"` and `4002 "replaced"`.
     */
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
    /** Whether `spaceId` was deleted (its id stays `gone`). */
    isDeleted: (spaceId: string) => deleted.has(spaceId),
  }
}

/** Where the fake server answers. */
export const FAKE_SPACES_URL = 'https://spaces.test'

/**
 * A Spaces client for one account on `server`, with a real account session
 * (`createAccountSessions`) opened with the dev bypass, so it refreshes and
 * reopens as the app's does.
 */
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
