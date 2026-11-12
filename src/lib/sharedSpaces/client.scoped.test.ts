import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import {
  createGuestSpacesClient,
  isSpaceError,
  SpaceError,
  type SpaceMemberAuth,
  type SpacesClient,
} from '@/lib/sharedSpaces/client'
import {
  deriveSpaceMember,
  joinVerifier,
  newSpaceId,
  wrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import {
  guestKeysRecordId,
  HEADER_RECORD_ID,
  inScopeRecordId,
  streetRecordId,
  workedRecordId,
} from '@/lib/sharedSpaces/records'
import {
  deriveLinkCredentials,
  deriveLinkSecret,
  newLinkId,
  scopeIdForStreet,
} from '@/lib/sharedSpaces/scopes'
import {
  createFakeSpacesServer,
  FAKE_SPACES_URL,
  fakeSpacesClient,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const HOUR = 60 * 60 * 1000

const S1 = scopeIdForStreet('11111111-1111-4111-8111-111111111111')
const S2 = scopeIdForStreet('22222222-2222-4222-8222-222222222222')
const S3 = scopeIdForStreet('33333333-3333-4333-8333-333333333333')
const door = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a'

type Person = { client: SpacesClient; seed: Uint8Array }
type Auth = SpaceMemberAuth

let clock: number
let server: FakeSpacesServer
let sent: { url: string; headers: Record<string, string> }[]

const person = (): Person => {
  const { client, accountKey } = fakeSpacesClient(server, {
    randomBytes: random,
  })
  return { client, seed: accountKey }
}

const blob = () => toB64u(random(60))
const record = (recordId: string, deleted = false) => ({
  recordId,
  epoch: 1,
  stamp: clock,
  deleted,
  blob: blob(),
})

async function refusal(run: () => Promise<unknown>): Promise<SpaceError> {
  try {
    await run()
  } catch (error) {
    if (error instanceof SpaceError) return error
    throw error
  }
  throw new Error('Expected a refusal')
}

let key: Uint8Array

async function scopedSpace(owner: Person, mode?: 'scoped'): Promise<Auth> {
  const spaceId = newSpaceId(random)
  const member = deriveSpaceMember(owner.seed, spaceId)
  await owner.client.create({
    spaceId,
    memberId: member.memberId,
    dhPub: member.dhPub,
    tokenHash: member.tokenHash,
    wrap: wrapSpaceKey(
      key,
      member.dhPub,
      { spaceId, epoch: 1, memberId: member.memberId },
      { ephemeral: random(32), nonce: random(24) }
    ),
    mode,
  })
  return { spaceId, memberId: member.memberId, token: member.token }
}

async function invite(
  inviter: Person,
  auth: Auth,
  options: { scopes?: string[]; handoff?: boolean } = {},
  expiresAt = clock + HOUR
) {
  const inviteId = toB64u(random(16))
  const joinSecret = random(32)
  await inviter.client.createInvite(auth, {
    inviteId,
    joinVerifier: joinVerifier(joinSecret),
    expiresAt,
    epoch: 1,
    ...options,
  })
  return { inviteId, joinSecret }
}

async function join(
  joiner: Person,
  spaceId: string,
  { inviteId, joinSecret }: { inviteId: string; joinSecret: Uint8Array }
): Promise<Auth> {
  const member = deriveSpaceMember(joiner.seed, spaceId)
  await joiner.client.join({
    spaceId,
    inviteId,
    joinSecret: toB64u(joinSecret),
    epoch: 1,
    memberId: member.memberId,
    dhPub: member.dhPub,
    tokenHash: member.tokenHash,
    wrap: wrapSpaceKey(
      key,
      member.dhPub,
      { spaceId, epoch: 1, memberId: member.memberId },
      { ephemeral: random(32), nonce: random(24) }
    ),
  })
  return { spaceId, memberId: member.memberId, token: member.token }
}

async function makeLink(
  creator: Person,
  auth: Auth,
  scopes: string[],
  expiresAt = clock + 24 * HOUR
) {
  const linkId = newLinkId(random)
  const linkSecret = deriveLinkSecret(creator.seed, auth.spaceId, linkId)
  const credentials = deriveLinkCredentials(linkSecret)
  await creator.client.createLink(auth, {
    linkId,
    verifier: credentials.verifier,
    scopes,
    expiresAt,
    epoch: 1,
  })
  await creator.client.put(auth, [record(guestKeysRecordId(linkId))])
  return {
    linkId,
    guest: {
      spaceId: auth.spaceId,
      linkId,
      linkToken: credentials.linkToken,
    },
  }
}

const ids = (page: { records: { recordId: string }[] }) =>
  page.records.map((r) => r.recordId).sort()

let owner: Person
let space: Auth

beforeEach(async () => {
  clock = Date.now()
  key = random(32)
  server = createFakeSpacesServer({ now: () => clock })
  sent = []
  const fetchImpl = server.fetchImpl
  server.fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit
  ) => {
    sent.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
    })
    return fetchImpl(url, init)
  }) as typeof fetch
  owner = person()
  space = await scopedSpace(owner, 'scoped')
  await owner.client.put(space, [
    record(HEADER_RECORD_ID),
    record(streetRecordId(S1)),
    record(workedRecordId(S1)),
    record(inScopeRecordId(S1, door)),
    record(streetRecordId(S2)),
    record(inScopeRecordId(S2, door)),
    record(streetRecordId(S3)),
  ])
})

describe('scoped spaces', () => {
  it('report their mode and people only when scoped', async () => {
    const page = await owner.client.sync(space, { since: 0 })
    expect(page.mode).toBe('scoped')
    expect(page.scoped).toEqual({
      members: [
        {
          memberId: space.memberId,
          dhPub: expect.any(String),
          joinedAt: expect.any(Number),
          scopes: null,
          invitedBy: null,
        },
      ],
      invites: [],
      holders: [],
      links: [],
    })

    const cars = await scopedSpace(owner)
    const carPage = await owner.client.sync(cars, { since: 0 })
    expect(carPage.mode).toBeNull()
    expect(carPage.scoped).toBeNull()
  })

  it('refuse scoped fields and ops on a space without a mode', async () => {
    const cars = await scopedSpace(owner)
    expect(
      (await refusal(() => invite(owner, cars, { scopes: [S1] }))).code
    ).toBe('bad_request')
    expect((await refusal(() => makeLink(owner, cars, [S1]))).code).toBe(
      'bad_request'
    )
    expect((await refusal(() => owner.client.endHandoff(cars, S1))).code).toBe(
      'bad_request'
    )
  })

  it('refuse record ids outside the grammar', async () => {
    const error = await refusal(() =>
      owner.client.put(space, [record('trip-1')])
    )
    expect(error.code).toBe('bad_request')
  })

  it('never let the owner leave', async () => {
    expect((await refusal(() => owner.client.leave(space))).code).toBe(
      'bad_request'
    )
  })

  it('give a street member only their streets, and keep invites to the owner', async () => {
    const pat = person()
    const patAuth = await join(
      pat,
      space.spaceId,
      await invite(owner, space, { scopes: [S1] })
    )
    const page = await pat.client.sync(patAuth, { since: 0 })
    expect(ids(page)).toEqual(
      [
        HEADER_RECORD_ID,
        streetRecordId(S1),
        workedRecordId(S1),
        inScopeRecordId(S1, door),
      ].sort()
    )
    expect(
      page.scoped?.members.find((m) => m.memberId === patAuth.memberId)
    ).toMatchObject({ scopes: [S1], invitedBy: space.memberId })

    await pat.client.put(patAuth, [record(inScopeRecordId(S1, door))])
    expect(
      (
        await refusal(() =>
          pat.client.put(patAuth, [record(inScopeRecordId(S2, door))])
        )
      ).code
    ).toBe('forbidden')
    expect(
      (await refusal(() => pat.client.put(patAuth, [record(HEADER_RECORD_ID)])))
        .code
    ).toBe('forbidden')

    await invite(owner, space, { scopes: [S2] })
    const patView = await pat.client.sync(patAuth, { since: 0 })
    const ownerView = await owner.client.sync(space, { since: 0 })
    expect(patView.scoped?.invites).toEqual([])
    expect(ownerView.scoped?.invites).toHaveLength(1)
  })

  it('page a filtered sync by what the caller may read', async () => {
    const pat = person()
    const patAuth = await join(
      pat,
      space.spaceId,
      await invite(owner, space, { scopes: [S1] })
    )
    const pages: string[][] = []
    await pat.client.syncFrom(
      patAuth,
      0,
      (page) => {
        pages.push(page.records.map((r) => r.recordId))
      },
      { limit: 2 }
    )
    expect(pages.flat().sort()).toEqual(
      [
        HEADER_RECORD_ID,
        streetRecordId(S1),
        workedRecordId(S1),
        inScopeRecordId(S1, door),
      ].sort()
    )
    expect(pages.every((page) => page.length <= 2)).toBe(true)
  })

  it('narrow a member’s streets and ask for a rekey', async () => {
    const pat = person()
    const patAuth = await join(
      pat,
      space.spaceId,
      await invite(owner, space, { scopes: [S1, S3] })
    )
    await owner.client.setMemberScopes(space, {
      target: patAuth.memberId,
      scopes: [S1, S2, S3],
    })
    expect((await owner.client.sync(space, { since: 0 })).rekeyNeeded).toBe(
      false
    )
    await owner.client.setMemberScopes(space, {
      target: patAuth.memberId,
      scopes: [S1],
    })
    const page = await owner.client.sync(space, { since: 0 })
    expect(page.rekeyNeeded).toBe(true)
    expect(
      page.scoped?.members.find((m) => m.memberId === patAuth.memberId)?.scopes
    ).toEqual([S1])
    expect(
      (
        await refusal(() =>
          pat.client.setMemberScopes(patAuth, {
            target: patAuth.memberId,
            scopes: null,
          })
        )
      ).code
    ).toBe('forbidden')
  })
})

describe('hand-offs', () => {
  it('hold a street from the invite, then make the joiner its holder', async () => {
    const joe = person()
    const handoff = await invite(owner, space, { scopes: [S2], handoff: true })

    const pending = await owner.client.sync(space, { since: 0 })
    expect(pending.scoped?.holders).toEqual([
      {
        scopeId: S2,
        memberId: null,
        inviteId: handoff.inviteId,
        since: clock,
      },
    ])
    expect(pending.scoped?.invites[0]).toMatchObject({
      scopes: [S2],
      handoff: true,
    })
    expect(
      (
        await refusal(() =>
          owner.client.put(space, [record(workedRecordId(S2))])
        )
      ).code
    ).toBe('forbidden')

    const joeAuth = await join(joe, space.spaceId, handoff)
    const held = await joe.client.sync(joeAuth, { since: 0 })
    expect(held.scoped?.holders).toEqual([
      { scopeId: S2, memberId: joeAuth.memberId, inviteId: null, since: clock },
    ])
    await joe.client.put(joeAuth, [record(workedRecordId(S2))])
    expect(
      (
        await refusal(() =>
          owner.client.put(space, [record(workedRecordId(S2))])
        )
      ).code
    ).toBe('forbidden')
    expect(
      (
        await refusal(() =>
          owner.client.createHandoff(space, {
            scopeId: S2,
            target: joeAuth.memberId,
          })
        )
      ).code
    ).toBe('conflict')
  })

  it('refuse a second hand-off by the holder, both ways', async () => {
    const joe = person()
    const joeAuth = await join(
      joe,
      space.spaceId,
      await invite(owner, space, { scopes: [S2], handoff: true })
    )
    expect(
      (
        await refusal(() =>
          invite(joe, joeAuth, { scopes: [S2], handoff: true })
        )
      ).code
    ).toBe('forbidden')
    const ann = person()
    const annAuth = await join(
      ann,
      space.spaceId,
      await invite(joe, joeAuth, { scopes: [S2] })
    )
    expect(
      (
        await refusal(() =>
          joe.client.createHandoff(joeAuth, {
            scopeId: S2,
            target: annAuth.memberId,
          })
        )
      ).code
    ).toBe('forbidden')
  })

  it('hand a street to someone already on it, adding it to their streets', async () => {
    const pat = person()
    const patAuth = await join(
      pat,
      space.spaceId,
      await invite(owner, space, { scopes: [S1] })
    )
    const { seq } = await owner.client.createHandoff(space, {
      scopeId: S3,
      target: patAuth.memberId,
    })
    const page = await pat.client.sync(patAuth, { since: 0 })
    expect(page.seq).toBe(seq)
    expect(
      page.scoped?.members.find((m) => m.memberId === patAuth.memberId)?.scopes
    ).toEqual([S1, S3])
    await pat.client.put(patAuth, [record(workedRecordId(S3))])
  })

  it('clear a pending hold when its invite is deleted or expires', async () => {
    const first = await invite(owner, space, { scopes: [S2], handoff: true })
    await owner.client.deleteInvite(space, first.inviteId)
    expect(
      (await owner.client.sync(space, { since: 0 })).scoped?.holders
    ).toEqual([])

    await invite(owner, space, { scopes: [S2], handoff: true }, clock + 1000)
    clock += 2000
    const page = await owner.client.sync(space, { since: 0 })
    expect(page.scoped?.holders).toEqual([])
    await owner.client.put(space, [record(workedRecordId(S2))])
  })

  it('take back: onward people lose the street, the holder’s links end, and a rekey is asked for', async () => {
    const joe = person()
    const joeAuth = await join(
      joe,
      space.spaceId,
      await invite(owner, space, { scopes: [S2], handoff: true })
    )
    const ann = person()
    const annAuth = await join(
      ann,
      space.spaceId,
      await invite(joe, joeAuth, { scopes: [S2] })
    )
    await ann.client.put(annAuth, [record(workedRecordId(S2))])
    const { guest } = await makeLink(joe, joeAuth, [S2])
    const guests = createGuestSpacesClient({
      baseUrl: FAKE_SPACES_URL,
      fetchImpl: server.fetchImpl,
    })
    await guests.guestSync(guest, { since: 0 })

    const giverView = await owner.client.sync(space, { since: 0 })
    expect(giverView.scoped?.links.map((l) => l.createdBy)).toEqual([
      joeAuth.memberId,
    ])
    expect(
      giverView.scoped?.members.filter((m) => m.invitedBy === joeAuth.memberId)
    ).toHaveLength(1)

    await owner.client.endHandoff(space, S2)
    const after = await owner.client.sync(space, { since: 0 })
    expect(after.scoped?.holders).toEqual([])
    expect(after.scoped?.members.map((m) => m.memberId)).toEqual([
      space.memberId,
    ])
    expect(after.rekeyNeeded).toBe(true)
    expect(after.scoped?.links[0].endedAt).toBe(clock)
    const ended = await refusal(() => guests.guestSync(guest, { since: 0 }))
    expect([ended.code, ended.reason]).toEqual(['gone', 'ended'])
    expect(
      (await refusal(() => ann.client.sync(annAuth, { since: 0 }))).code
    ).toBe('gone')
    await owner.client.put(space, [record(workedRecordId(S2))])
    expect((await owner.client.endHandoff(space, S2)).seq).toBe(
      (await owner.client.sync(space, { since: 0 })).seq
    )
  })

  it('give back keeps a whole member on the territory', async () => {
    const wes = person()
    const wesAuth = await join(wes, space.spaceId, await invite(owner, space))
    await owner.client.createHandoff(space, {
      scopeId: S1,
      target: wesAuth.memberId,
    })
    await wes.client.endHandoff(wesAuth, S1)
    const page = await wes.client.sync(wesAuth, { since: 0 })
    expect(page.scoped?.holders).toEqual([])
    expect(page.rekeyNeeded).toBe(false)
  })

  it('gives every street back when a holder leaves', async () => {
    const wes = person()
    const wesAuth = await join(wes, space.spaceId, await invite(owner, space))
    await owner.client.createHandoff(space, {
      scopeId: S1,
      target: wesAuth.memberId,
    })
    await wes.client.leave(wesAuth)
    const page = await owner.client.sync(space, { since: 0 })
    expect(page.scoped?.holders).toEqual([])
    await owner.client.put(space, [record(workedRecordId(S1))])
  })
})

describe('guest links', () => {
  const guests = () =>
    createGuestSpacesClient({
      baseUrl: FAKE_SPACES_URL,
      fetchImpl: server.fetchImpl,
    })

  it('read the link’s keys and its streets, and write inside them, without a session', async () => {
    const { linkId, guest } = await makeLink(owner, space, [S1])
    sent.length = 0
    const page = await guests().guestSync(guest, { since: 0 })
    expect(ids(page)).toEqual(
      [
        guestKeysRecordId(linkId),
        streetRecordId(S1),
        workedRecordId(S1),
        inScopeRecordId(S1, door),
      ].sort()
    )
    expect(page.epoch).toBe(1)
    expect(page.expiresAt).toBe(clock + 24 * HOUR)
    expect(Math.abs(page.serverTime! - clock)).toBeLessThan(1000)

    const put = await guests().guestPut(guest, [
      record(inScopeRecordId(S1, '0b1f5c2e-8a7d-4e6f-9a3b-2c1d0e9f8a7b')),
    ])
    expect(put.results[0].stored).toBe(true)
    for (const call of sent) {
      expect(
        Object.keys(call.headers).map((name) => name.toLowerCase())
      ).not.toContain('authorization')
      expect(call.url).not.toContain(guest.linkToken)
      expect(call.url).not.toContain(linkId)
    }
  })

  it('refuse a bare street, another street, or the header from a guest', async () => {
    const { guest } = await makeLink(owner, space, [S1])
    for (const recordId of [
      streetRecordId(S1),
      workedRecordId(S2),
      HEADER_RECORD_ID,
    ])
      expect(
        (await refusal(() => guests().guestPut(guest, [record(recordId)])))
          .code,
        recordId
      ).toBe('forbidden')
  })

  it('answer not_found alike for an unknown space, link, or token', async () => {
    const { guest } = await makeLink(owner, space, [S1])
    const wrong = [
      { ...guest, spaceId: newSpaceId(random) },
      { ...guest, linkId: newLinkId(random) },
      { ...guest, linkToken: toB64u(random(32)) },
    ]
    for (const link of wrong) {
      const error = await refusal(() => guests().guestSync(link, { since: 0 }))
      expect([error.code, error.status, error.reason]).toEqual([
        'not_found',
        404,
        null,
      ])
    }
    await guests().guestSync(guest, { since: 0 })
  })

  it('end with a reason: ended by its creator, expired after its time, or the territory returned', async () => {
    const ended = await makeLink(owner, space, [S1])
    await owner.client.endLink(space, ended.linkId)
    await owner.client.endLink(space, ended.linkId)
    const one = await refusal(() =>
      guests().guestSync(ended.guest, { since: 0 })
    )
    expect([one.code, one.status, one.reason]).toEqual(['gone', 410, 'ended'])

    const expiring = await makeLink(owner, space, [S1], clock + HOUR)
    clock += HOUR
    const two = await refusal(() =>
      guests().guestPut(expiring.guest, [record(workedRecordId(S1))])
    )
    expect([two.code, two.reason]).toEqual(['gone', 'expired'])

    clock -= HOUR
    const live = await makeLink(owner, space, [S1])
    await owner.client.deleteSpace(space)
    const three = await refusal(() =>
      guests().guestSync(live.guest, { since: 0 })
    )
    expect([three.code, three.reason]).toEqual(['gone', 'ended'])
  })

  it('stop reaching a street once it is handed off away from the link’s creator', async () => {
    const { guest } = await makeLink(owner, space, [S1, S2])
    await invite(owner, space, { scopes: [S2], handoff: true })
    const page = await guests().guestSync(guest, { since: 0 })
    expect(page.records.some((r) => r.recordId.includes(S2))).toBe(false)
    expect(
      (
        await refusal(() =>
          guests().guestPut(guest, [record(workedRecordId(S2))])
        )
      ).code
    ).toBe('forbidden')
  })

  it('pause while the guest switch is off', async () => {
    const { guest } = await makeLink(owner, space, [S1])
    server.state.guests = false
    const error = await refusal(() => guests().guestSync(guest, { since: 0 }))
    expect(error.code).toBe('disabled')
    expect(error.retryAfterMs).toBeGreaterThan(0)
    await makeLink(owner, space, [S1])
  })

  it('check link lifetime, epoch, reuse, and the open-link cap', async () => {
    const linkId = newLinkId(random)
    const { verifier } = deriveLinkCredentials(
      deriveLinkSecret(owner.seed, space.spaceId, linkId)
    )
    const create = (
      fields: Partial<Parameters<SpacesClient['createLink']>[1]>
    ) =>
      owner.client.createLink(space, {
        linkId,
        verifier,
        scopes: [S1],
        expiresAt: clock + HOUR,
        epoch: 1,
        ...fields,
      })
    expect(
      (await refusal(() => create({ expiresAt: clock + 25 * HOUR }))).code
    ).toBe('bad_request')
    expect((await refusal(() => create({ expiresAt: clock }))).code).toBe(
      'bad_request'
    )
    expect((await refusal(() => create({ epoch: 2 }))).code).toBe('stale_key')
    const first = await create({})
    expect((await create({})).seq).toBe(first.seq)
    expect((await refusal(() => create({ scopes: [S3] }))).code).toBe(
      'conflict'
    )
    for (let n = 1; n < 10; n++) await makeLink(owner, space, [S1])
    expect((await refusal(() => makeLink(owner, space, [S1]))).code).toBe(
      'limit'
    )
  })

  it('let only the owner and holders make links, within their streets', async () => {
    const pat = person()
    const patAuth = await join(
      pat,
      space.spaceId,
      await invite(owner, space, { scopes: [S1] })
    )
    expect((await refusal(() => makeLink(pat, patAuth, [S1]))).code).toBe(
      'forbidden'
    )
    await invite(owner, space, { scopes: [S2], handoff: true })
    expect((await refusal(() => makeLink(owner, space, [S2]))).code).toBe(
      'forbidden'
    )
  })
})

describe('guest client', () => {
  it('maps transport errors and refusals like the member client', async () => {
    const { guest } = await makeLink(owner, space, [S1])
    const client = createGuestSpacesClient({
      baseUrl: FAKE_SPACES_URL,
      fetchImpl: server.fetchImpl,
    })
    server.refuseNext('guest/sync', 429, 'rate_limited', 30)
    const error = await refusal(() => client.guestSync(guest, { since: 0 }))
    expect(isSpaceError(error, 'rate_limited')).toBe(true)
    await expect(
      client.guestPut(
        guest,
        Array.from({ length: 21 }, () => record('x'))
      )
    ).rejects.toThrow('A guest put takes 1 to 20 records')
    await expect(
      client.guestSync(guest, { since: 0, limit: 501 })
    ).rejects.toThrow('Invalid limit')
  })
})
