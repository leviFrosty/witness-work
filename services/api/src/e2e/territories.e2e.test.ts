import { afterAll, describe, expect, it } from 'vitest'
import {
  b64u,
  blobOfSize,
  randomBytes,
  randomId,
  sha256B64u,
  spaceMemberId,
} from '../test/buddiesClient'
import {
  DEV_BYPASS_TOKEN,
  LOCAL_LAUNCHER,
  bearerHeaders,
  http,
  localKv,
  openSession,
  writeTranscript,
  type E2ESession,
} from '../test/e2e'

/**
 * Territories (witness-work ADR 0047, `docs/territories-protocol.md`) over
 * real HTTP against the local worker's `SharedSpace`: an owner makes a
 * scoped space, two members write and sync street records, the owner hands
 * a street off, the holder shares it onward and is refused a second
 * hand-off both ways, a guest link reads and writes through the public
 * guest ops with no session, and ending the link, the kill switch, and an
 * unknown link each refuse it. Run with `pnpm test:e2e
 * src/e2e/territories.e2e.test.ts` after `node scripts/verify/dev.mjs up`.
 */

afterAll(() => {
  writeTranscript('territories')
})

const wrap = () => blobOfSize(105)
const scope = () => randomId()
const uuid = () => crypto.randomUUID()

class Member {
  readonly tokenBytes = randomBytes(32)
  readonly token = b64u(this.tokenBytes)
  readonly dhPub = b64u(randomBytes(32))
  memberId = ''

  private constructor(
    readonly session: E2ESession,
    readonly spaceId: string
  ) {}

  static async open(spaceId: string): Promise<Member> {
    const member = new Member(await openSession(), spaceId)
    member.memberId = await spaceMemberId(spaceId, member.dhPub)
    return member
  }

  get fields() {
    return { spaceId: this.spaceId, memberId: this.memberId, token: this.token }
  }

  op(op: string, body: Record<string, unknown>) {
    return http('POST', `/spaces/v1/${op}`, {
      body: { ...this.fields, ...body },
      headers: bearerHeaders(this.session),
    })
  }

  async create() {
    return http('POST', '/spaces/v1/create', {
      body: {
        spaceId: this.spaceId,
        memberId: this.memberId,
        dhPub: this.dhPub,
        tokenHash: await sha256B64u(this.tokenBytes),
        wrap: wrap(),
        mode: 'scoped',
      },
      headers: bearerHeaders(this.session),
    })
  }

  sync(since = 0) {
    return this.op('sync', { since })
  }

  put(recordIds: string[], stamp = Date.now()) {
    return this.op('put', {
      records: recordIds.map((recordId) => ({ recordId, epoch: 1, stamp, blob: blobOfSize(64) })),
    })
  }

  async invite(extra: Record<string, unknown> = {}) {
    const secret = randomBytes(32)
    const invite = {
      inviteId: randomId(),
      joinSecret: b64u(secret),
      joinVerifier: await sha256B64u(secret),
      expiresAt: Date.now() + 7 * 24 * 60 * 60_000,
      epoch: 1,
    }
    const response = await this.op('invite/create', {
      inviteId: invite.inviteId,
      joinVerifier: invite.joinVerifier,
      expiresAt: invite.expiresAt,
      epoch: 1,
      ...extra,
    })
    return { ...invite, response }
  }

  async join(invite: { inviteId: string; joinSecret: string; epoch: number }) {
    return http('POST', '/spaces/v1/join', {
      body: {
        spaceId: this.spaceId,
        inviteId: invite.inviteId,
        joinSecret: invite.joinSecret,
        epoch: invite.epoch,
        memberId: this.memberId,
        dhPub: this.dhPub,
        tokenHash: await sha256B64u(this.tokenBytes),
        wrap: wrap(),
      },
      headers: bearerHeaders(this.session),
    })
  }

  /** Joins through `inviter` with `extra` (`scopes`, `handoff`). */
  async joinVia(inviter: Member, extra: Record<string, unknown> = {}) {
    const invite = await inviter.invite(extra)
    expect(invite.response.status).toBe(200)
    expect((await this.join(invite)).status).toBe(200)
  }
}

const recordIds = (exchange: { body: { records: { recordId: string }[] } }) =>
  exchange.body.records.map((record) => record.recordId).sort()

/** The guest page: no session, only the link. */
const guest = (spaceId: string, linkId: string, linkToken: string) => ({
  sync: (since = 0) =>
    http('POST', '/spaces/v1/guest/sync', { body: { spaceId, linkId, linkToken, since } }),
  put: (recordIds: string[]) =>
    http('POST', '/spaces/v1/guest/put', {
      body: {
        spaceId,
        linkId,
        linkToken,
        records: recordIds.map((recordId) => ({
          recordId,
          epoch: 1,
          stamp: Date.now(),
          blob: blobOfSize(64),
        })),
      },
    }),
})

describe.skipIf(!DEV_BYPASS_TOKEN)('Territories on the local worker', () => {
  it('shares streets, hands one off, refuses a second hand-off, and works a guest link', async () => {
    const spaceId = randomId()
    const owner = await Member.open(spaceId)
    expect((await owner.create()).body).toMatchObject({ ok: true, seq: 1 })
    const [S1, S2, S3] = [scope(), scope(), scope()]

    // The owner seeds the territory; two members join: Ann on S1, Ben whole.
    expect(
      (await owner.put(['h', `s.${S1}`, `s.${S2}`, `s.${S3}`, `d.${uuid()}`])).status
    ).toBe(200)
    const ann = await Member.open(spaceId)
    await ann.joinVia(owner, { scopes: [S1] })
    const ben = await Member.open(spaceId)
    await ben.joinVia(owner)

    // Both write street records and read each other's.
    const annDoor = `s.${S1}.${uuid()}`
    const benDoor = `s.${S2}.${uuid()}`
    expect((await ann.put([annDoor, `s.${S1}.w`])).status).toBe(200)
    expect((await ben.put([benDoor])).status).toBe(200)
    expect((await ann.put([`s.${S2}.w`])).body).toMatchObject({ code: 'forbidden' })
    expect(recordIds(await ben.sync())).toContain(annDoor)
    const annSees = recordIds(await ann.sync())
    expect(annSees).toContain(annDoor)
    expect(annSees).not.toContain(benDoor)
    expect(annSees.some((id) => id.startsWith('d.'))).toBe(false)

    // The owner hands S2 to Cal, who accepts.
    const cal = await Member.open(spaceId)
    await cal.joinVia(owner, { scopes: [S2], handoff: true })
    const synced = await owner.sync()
    expect(synced.body.mode).toBe('scoped')
    expect(synced.body.holders).toEqual([
      { scopeId: S2, memberId: cal.memberId, inviteId: null, since: expect.any(Number) },
    ])
    expect((await owner.put([`s.${S2}.w`])).body).toMatchObject({ code: 'forbidden' })
    expect((await cal.put([`s.${S2}.w`])).status).toBe(200)

    // Cal can never hand it on, either way.
    expect((await cal.invite({ scopes: [S2], handoff: true })).response.body).toMatchObject({
      code: 'forbidden',
    })
    expect(
      (await cal.op('handoff/create', { scopeId: S2, target: ann.memberId })).body
    ).toMatchObject({ code: 'forbidden' })
    // But shares it onward.
    const dee = await Member.open(spaceId)
    await dee.joinVia(cal, { scopes: [S2] })
    expect((await dee.put([`s.${S2}.${uuid()}`])).status).toBe(200)

    // Cal makes a guest link on S2.
    const tokenBytes = randomBytes(32)
    const linkToken = b64u(tokenBytes)
    const linkId = randomId()
    const created = await cal.op('link/create', {
      linkId,
      verifier: await sha256B64u(tokenBytes),
      scopes: [S2],
      expiresAt: Date.now() + 23 * 60 * 60_000,
      epoch: 1,
    })
    expect(created.body).toMatchObject({ ok: true })
    expect((await cal.put([`g.${linkId}`])).status).toBe(200)

    // The guest reads and writes S2 only, with no session.
    const page = guest(spaceId, linkId, linkToken)
    const read = await page.sync()
    expect(read.status).toBe(200)
    const seen = recordIds(read)
    expect(seen).toContain(`g.${linkId}`)
    expect(seen).toContain(benDoor)
    expect(seen.some((id) => id.startsWith(`s.${S1}`))).toBe(false)
    expect(seen).not.toContain('h')
    const guestDoor = `s.${S2}.${uuid()}`
    expect((await page.put([guestDoor])).body).toMatchObject({ ok: true })
    expect((await page.put([`s.${S2}`])).body).toMatchObject({ code: 'forbidden' })
    expect((await page.put([`s.${S1}.w`])).body).toMatchObject({ code: 'forbidden' })
    expect(recordIds(await owner.sync())).toContain(guestDoor)

    // An unknown link and a wrong token are the same not_found.
    const unknown = await guest(spaceId, randomId(), linkToken).sync()
    const wrong = await guest(spaceId, linkId, b64u(randomBytes(32))).sync()
    expect(unknown.status).toBe(404)
    expect(wrong.body).toEqual(unknown.body)

    // Ended, it refuses at once.
    expect((await cal.op('link/end', { linkId })).body).toMatchObject({ ok: true })
    expect(await page.sync()).toMatchObject({
      status: 410,
      body: { code: 'gone', reason: 'ended' },
    })

    // The owner takes S2 back: Dee loses it and is removed; Cal too.
    expect((await owner.op('handoff/end', { scopeId: S2 })).body).toMatchObject({ ok: true })
    expect((await dee.sync()).status).toBe(410)
    expect((await cal.sync()).status).toBe(410)
    expect((await owner.put([`s.${S2}.w`], Date.now() + 1_000)).status).toBe(200)

    // The owner can't leave; returning deletes the space.
    expect((await owner.op('leave', {})).body).toMatchObject({ code: 'bad_request' })
    expect((await owner.op('delete', {})).body).toMatchObject({ ok: true })
    expect((await ann.sync()).status).toBe(410)
  })

  it.skipIf(!LOCAL_LAUNCHER)('pauses guest links with spaces:guests', async () => {
    const spaceId = randomId()
    const owner = await Member.open(spaceId)
    await owner.create()
    const tokenBytes = randomBytes(32)
    const linkId = randomId()
    localKv('put', 'spaces:guests', 'false')
    try {
      // Links can still be made while guests are paused.
      expect(
        (
          await owner.op('link/create', {
            linkId,
            verifier: await sha256B64u(tokenBytes),
            scopes: [scope()],
            expiresAt: Date.now() + 60 * 60_000,
            epoch: 1,
          })
        ).status
      ).toBe(200)
      const paused = await guest(spaceId, linkId, b64u(tokenBytes)).sync()
      expect(paused).toMatchObject({ status: 503, body: { code: 'disabled' } })
      expect(paused.headers.get('retry-after')).toBe('60')
    } finally {
      localKv('delete', 'spaces:guests')
    }
    expect((await guest(spaceId, linkId, b64u(tokenBytes)).sync()).status).toBe(200)
  })
})
