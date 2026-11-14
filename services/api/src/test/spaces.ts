import { createAccountsRoutes } from '../accounts/route'
import { createSpacesRoutes } from '../spaces/route'
import type { Environment } from '../types'
import { bearer, openTestSession, requestJson, type TestSession } from './accounts'
import {
  b64u,
  blobOfSize,
  randomBytes,
  randomId,
  sha256B64u,
  spaceMemberId,
} from './buddiesClient'
import type { FakeWebSocket } from './durableObjects'

/**
 * Client helpers for Shared Spaces tests: the real `/spaces/v1` routes on a
 * Buddies harness's env (`createHarness()`, which binds `SHARED_SPACE`), and
 * people with account sessions opened through the dev bypass.
 */

const accounts = createAccountsRoutes()
export const spacesRoutes = createSpacesRoutes()

/** A wrap as the app makes one: 105 opaque bytes. */
export const fakeWrap = (): string => blobOfSize(105)

/**
 * A rekey's `link` as the app makes one: the record `k.<epoch>` (the
 * previous key sealed under the new one, about 90 bytes), stamped now.
 */
export const fakeLink = (stamp: number = Date.now()) => ({
  stamp,
  blob: blobOfSize(90),
})

/** A 32-byte secret and the verifier the server keeps for it. */
export const joinSecret = async () => {
  const bytes = randomBytes(32)
  return { joinSecret: b64u(bytes), joinVerifier: await sha256B64u(bytes) }
}

export interface RecordInput {
  recordId?: string
  epoch?: number
  stamp?: number
  deleted?: boolean
  blob?: string
}

export interface Invite {
  inviteId: string
  joinSecret: string
  joinVerifier: string
  expiresAt: number
  epoch: number
}

export interface LiveAttempt {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
  socket: FakeWebSocket | null
}

/**
 * One person on one space: their own account session, and the X25519 key
 * (only its public half matters here), member id, and token every device of
 * theirs derives for the space.
 */
export class SpaceMember {
  readonly tokenBytes = randomBytes(32)
  readonly token = b64u(this.tokenBytes)
  /** The epoch 1 wrap `create` sends, the same on a retry. */
  readonly #wrap = fakeWrap()
  epoch = 1

  private constructor(
    readonly env: Environment,
    public session: TestSession,
    readonly spaceId: string,
    readonly dhPub: string,
    readonly memberId: string
  ) {}

  static async open(
    env: Environment,
    spaceId: string = randomId(),
    session?: TestSession
  ): Promise<SpaceMember> {
    const dhPub = b64u(randomBytes(32))
    return new SpaceMember(
      env,
      session ?? (await openTestSession(accounts as never, env)),
      spaceId,
      dhPub,
      await spaceMemberId(spaceId, dhPub)
    )
  }

  /** Someone else (their own session) for the same space. */
  other(): Promise<SpaceMember> {
    return SpaceMember.open(this.env, this.spaceId)
  }

  tokenHash(): Promise<string> {
    return sha256B64u(this.tokenBytes)
  }

  /** The member fields every member op carries. */
  get fields() {
    return { spaceId: this.spaceId, memberId: this.memberId, token: this.token }
  }

  /**
   * A new session for the same account key once the access token has
   * expired (tests move the clock by days), as the app's refresh would.
   * The space never sees which session calls.
   */
  async fresh(): Promise<TestSession> {
    if (Date.now() >= this.session.accessExpiresAt)
      this.session = await openTestSession(accounts as never, this.env, this.session.key)
    return this.session
  }

  async send(op: string, body: unknown, headers: Record<string, string> = {}) {
    const session = await this.fresh()
    return requestJson(spacesRoutes as never, this.env, 'POST', `/${op}`, body, {
      ...bearer(session.accessToken),
      ...headers,
    })
  }

  /** `create`'s body (the same each call unless `wrap` or `overrides` say). */
  async createBody(
    wrap: string = this.#wrap,
    overrides: Record<string, unknown> = {}
  ) {
    return {
      spaceId: this.spaceId,
      memberId: this.memberId,
      dhPub: this.dhPub,
      tokenHash: await this.tokenHash(),
      wrap,
      ...overrides,
    }
  }

  async create(wrap?: string, overrides: Record<string, unknown> = {}) {
    return this.send('create', await this.createBody(wrap, overrides))
  }

  sync(since = 0, extra: Record<string, unknown> = {}) {
    return this.send('sync', { ...this.fields, since, ...extra })
  }

  /** Puts `records`, each defaulting to a fresh id at this member's epoch, now. */
  put(records: RecordInput[]) {
    return this.send('put', {
      ...this.fields,
      records: records.map((record) => ({
        recordId: record.recordId ?? randomId(),
        epoch: record.epoch ?? this.epoch,
        stamp: record.stamp ?? Date.now(),
        ...(record.deleted === undefined ? {} : { deleted: record.deleted }),
        blob: record.blob ?? blobOfSize(64),
      })),
    })
  }

  /**
   * Opens an invite at this member's epoch (7 days unless `expiresAt` says
   * otherwise); `extra` adds body fields (a scoped space's `scopes`, `handoff`).
   */
  async invite(
    fields: Partial<Invite> = {},
    extra: Record<string, unknown> = {}
  ): Promise<Invite & { response: Awaited<ReturnType<SpaceMember['send']>> }> {
    const secret = await joinSecret()
    const invite: Invite = {
      inviteId: fields.inviteId ?? randomId(),
      joinSecret: fields.joinSecret ?? secret.joinSecret,
      joinVerifier: fields.joinVerifier ?? secret.joinVerifier,
      expiresAt: fields.expiresAt ?? Date.now() + 7 * 24 * 60 * 60_000,
      epoch: fields.epoch ?? this.epoch,
    }
    const response = await this.send('invite/create', {
      ...this.fields,
      inviteId: invite.inviteId,
      joinVerifier: invite.joinVerifier,
      expiresAt: invite.expiresAt,
      epoch: invite.epoch,
      ...extra,
    })
    return { ...invite, response }
  }

  deleteInvite(inviteId: string) {
    return this.send('invite/delete', { ...this.fields, inviteId })
  }

  /**
   * Joins with `invite` at its epoch (this member's when the invite doesn't
   * say), as the app sends the `car.invite`'s.
   */
  async join(
    invite: Pick<Invite, 'inviteId' | 'joinSecret'> & Partial<Pick<Invite, 'epoch'>>,
    overrides: Record<string, unknown> = {}
  ) {
    return this.send('join', {
      spaceId: this.spaceId,
      inviteId: invite.inviteId,
      joinSecret: invite.joinSecret,
      epoch: invite.epoch ?? this.epoch,
      memberId: this.memberId,
      dhPub: this.dhPub,
      tokenHash: await this.tokenHash(),
      wrap: fakeWrap(),
      ...overrides,
    })
  }

  /** `invite` by `inviter` (`extra` as `invite`'s), then `join`; throws unless both succeed. */
  async joinVia(
    inviter: SpaceMember,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    const invite = await inviter.invite({}, extra)
    if (invite.response.status !== 200)
      throw new Error(`invite failed: ${JSON.stringify(invite.response.body)}`)
    const joined = await this.join(invite)
    if (joined.status !== 200)
      throw new Error(`join failed: ${JSON.stringify(joined.body)}`)
    this.epoch = joined.body.epoch
  }

  leave() {
    return this.send('leave', this.fields)
  }

  remove(other: SpaceMember | string) {
    return this.send('member/remove', {
      ...this.fields,
      removeId: typeof other === 'string' ? other : other.memberId,
    })
  }

  /**
   * Rekeys to `epoch` with a fresh wrap for each of `members` and a fresh
   * `link` (`overrides` replace body fields; `link: undefined` leaves it
   * out); on success the `SpaceMember`s named move to it.
   */
  async rekey(
    epoch: number,
    members: (SpaceMember | string)[],
    overrides: Record<string, unknown> = {}
  ) {
    const response = await this.send('rekey', {
      ...this.fields,
      epoch,
      wraps: members.map((member) => ({
        memberId: typeof member === 'string' ? member : member.memberId,
        wrap: fakeWrap(),
      })),
      link: fakeLink(),
      ...overrides,
    })
    if (response.status === 200)
      for (const member of members)
        if (typeof member !== 'string') member.epoch = epoch
    return response
  }

  deleteSpace() {
    return this.send('delete', this.fields)
  }

  /** The `x-ww-space-auth` header for this member (or other fields). */
  liveHeader(
    fields: Record<string, unknown> = { spaceId: this.spaceId, memberId: this.memberId }
  ): string {
    return b64u(new TextEncoder().encode(JSON.stringify(fields)))
  }

  async live(headers: Record<string, string> = {}): Promise<LiveAttempt> {
    const session = await this.fresh()
    const response = (await spacesRoutes.request(
      '/live',
      {
        method: 'GET',
        headers: {
          ...bearer(session.accessToken),
          upgrade: 'websocket',
          'x-ww-space-auth': this.liveHeader(),
          'x-ww-space-token': this.token,
          ...headers,
        },
      },
      this.env
    )) as Response & { webSocket?: FakeWebSocket | null }
    if (response.status === 101)
      return { status: 101, body: null, socket: response.webSocket ?? null }
    return { status: response.status, body: await response.json(), socket: null }
  }
}

/** The shared error body. */
export const spacesError = (code: string) => ({ ok: false, error: code, code })

// --- Territories (scoped spaces) and guest links ---------------------------

/** A random lowercase RFC 9562 version 4 UUID, for a record id's last part. */
export const uuid = (): string => crypto.randomUUID()

/** A street's scope id: `b64u` of 16 random bytes. */
export const scopeId = (): string => randomId()

/** A link token and the verifier `link/create` sends for it. */
export const linkSecret = async () => {
  const bytes = randomBytes(32)
  return { linkToken: b64u(bytes), verifier: await sha256B64u(bytes) }
}

/**
 * A guest link's page in a browser: no session, the link's token, and a
 * caller IP of its own (`cf-connecting-ip`).
 */
export class GuestPage {
  epoch = 1

  constructor(
    readonly env: Environment,
    readonly spaceId: string,
    readonly linkId: string,
    readonly linkToken: string,
    public ip = '198.51.100.7'
  ) {}

  get fields() {
    return { spaceId: this.spaceId, linkId: this.linkId, linkToken: this.linkToken }
  }

  send(op: string, body: unknown, headers: Record<string, string> = {}) {
    return requestJson(spacesRoutes as never, this.env, 'POST', `/${op}`, body, {
      'cf-connecting-ip': this.ip,
      ...headers,
    })
  }

  sync(since = 0, extra: Record<string, unknown> = {}) {
    return this.send('guest/sync', { ...this.fields, since, ...extra })
  }

  put(records: RecordInput[]) {
    return this.send('guest/put', {
      ...this.fields,
      records: records.map((record) => ({
        recordId: record.recordId ?? randomId(),
        epoch: record.epoch ?? this.epoch,
        stamp: record.stamp ?? Date.now(),
        ...(record.deleted === undefined ? {} : { deleted: record.deleted }),
        blob: record.blob ?? blobOfSize(64),
      })),
    })
  }
}

/** Opens a guest link on `scopes` as `creator` (24 hours unless told). */
export const openLink = async (
  creator: SpaceMember,
  scopes: string[],
  fields: Partial<{ linkId: string; expiresAt: number; epoch: number }> = {}
) => {
  const secret = await linkSecret()
  const linkId = fields.linkId ?? randomId()
  const expiresAt = fields.expiresAt ?? Date.now() + 24 * 60 * 60_000
  const response = await creator.send('link/create', {
    ...creator.fields,
    linkId,
    verifier: secret.verifier,
    scopes,
    expiresAt,
    epoch: fields.epoch ?? creator.epoch,
  })
  return {
    linkId,
    expiresAt,
    ...secret,
    response,
    guest: new GuestPage(creator.env, creator.spaceId, linkId, secret.linkToken),
  }
}
