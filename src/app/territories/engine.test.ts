import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isSpaceError } from '@/lib/sharedSpaces/client'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import { scopeIdForStreet } from '@/lib/sharedSpaces/scopes'
import {
  createFakeSpacesServer,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import { endedCopyId } from '@/app/territories/engine'
import {
  doorId,
  ELM,
  guestFor,
  OAK,
  sampleTerritory,
  type TerritoryTestPerson,
  territoryPerson,
} from '@/app/territories/testing/territoryPeople'
import { logDoor, updateStreet } from '@/features/territories/lib/doors'
import { findLiveLink } from '@/features/territories/lib/sharing'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

let server: FakeSpacesServer
let anna: TerritoryTestPerson
let joe: TerritoryTestPerson
let kim: TerritoryTestPerson

beforeEach(() => {
  server = createFakeSpacesServer({ now: Date.now })
  anna = territoryPerson(server, 'Anna', random)
  joe = territoryPerson(server, 'Joe', random)
  kim = territoryPerson(server, 'Kim', random)
  anna.store.getState().save(sampleTerritory())
})

afterEach(() => {
  vi.restoreAllMocks()
})

const record = (
  person: TerritoryTestPerson,
  streetId: string,
  label: string,
  id: string
) =>
  person.update('territory-1', (t) =>
    updateStreet(t, streetId, (street) =>
      logDoor(street, { id, label, outcome: 'spoke', at: Date.now() })
    )
  )

async function shareWith(
  owner: TerritoryTestPerson,
  other: TerritoryTestPerson,
  streetIds?: string[]
) {
  const { invites } = await owner.engine.shareWithBuddies(
    'territory-1',
    [other.buddy],
    streetIds
  )
  const [sent] = invites
  if (!sent) throw new Error('No invitation')
  await other.engine.joinTerritory(sent.invite)
  await owner.engine.syncAll()
  return sent.invite
}

describe('sharing a territory', () => {
  it('seeds a scoped space on first share and keeps the territory one view', async () => {
    const spaceId = await anna.engine.ensureSpace('territory-1')
    expect(server.spaces.get(spaceId)?.mode).toBe('scoped')
    expect(anna.territories()).toHaveLength(1)
    const view = anna.territory()
    expect(view.shared).toMatchObject({ spaceId, role: 'owner' })
    expect(view.streets.map((s) => s.name)).toEqual([
      'Oak Street',
      'Elm Street',
    ])
    expect(anna.store.getState().seeding).toEqual({})
  })

  it('whole territory: both record live and see each other’s doors', async () => {
    const invite = await shareWith(anna, joe)
    expect(invite.streets).toEqual([])
    expect(invite.title).toBe('12 · North Hill')
    const seen = joe.territory()
    expect(seen.received).toMatchObject({
      kind: 'shared',
      from: { name: 'Anna' },
    })
    expect(seen.streets[0]?.doors.map((d) => d.label)).toEqual(['1'])
    expect(seen.doNotCalls).toHaveLength(2)

    record(joe, OAK, '3', doorId(3))
    await joe.engine.syncAll()
    await anna.engine.syncAll()
    const oak = anna.territory().streets[0]!
    expect(oak.doors.find((d) => d.label === '3')?.by).toBe(
      joe.territory().shared?.me
    )
    expect(oak.next).toBe(2)
    expect(
      anna.territory().people?.find((p) => p.id === oak.doors[1]?.by)?.name
    ).toBe('Joe')

    record(anna, OAK, '2', doorId(2))
    await anna.engine.syncAll()
    await joe.engine.syncAll()
    expect(
      joe
        .territory()
        .streets[0]?.doors.map((d) => d.label)
        .sort()
    ).toEqual(['1', '2', '3'])
    expect(anna.territory().shares).toEqual([
      expect.objectContaining({
        kind: 'person',
        personId: joe.territory().shared?.me,
      }),
    ])
  })

  it('some streets: the buddy sees only those streets and their do-not-calls', async () => {
    await shareWith(anna, joe, [ELM])
    const seen = joe.territory()
    expect(seen.streets.map((s) => s.id)).toEqual([ELM])
    expect(seen.doNotCalls.map((d) => d.address)).toEqual(['5 Elm Street'])
  })

  it('adding streets to someone already on it widens their scopes', async () => {
    await shareWith(anna, joe, [ELM])
    const again = await anna.engine.shareWithBuddies(
      'territory-1',
      [joe.buddy],
      [OAK]
    )
    expect(again).toMatchObject({ invites: [], widened: 1 })
    await joe.engine.syncAll()
    expect(
      joe
        .territory()
        .streets.map((s) => s.id)
        .sort()
    ).toEqual([OAK, ELM].sort())
  })

  it('stopping sharing removes the buddy, rekeys, and leaves them a read-only copy', async () => {
    await shareWith(anna, joe)
    const joeId = joe.territory().shared!.me
    await anna.engine.stopSharingWith('territory-1', joeId)
    await anna.engine.syncAll()
    expect(server.spaces.get(anna.territory().shared!.spaceId)?.epoch).toBe(2)
    const spaceId = anna.territory().shared!.spaceId
    await joe.engine.syncAll()
    const copy = joe.territory(endedCopyId(spaceId))
    expect(copy.shared).toBeUndefined()
    expect(copy.received?.endedAt).toBeDefined()
    expect(copy.streets.every((s) => s.doors.length === 0)).toBe(true)
  })

  it('a buddy who leaves loses the territory; the owner sees them gone', async () => {
    await shareWith(anna, joe)
    await joe.engine.leaveTerritory('territory-1')
    expect(joe.territories()).toEqual([])
    await anna.engine.syncAll()
    expect(anna.territory().shares).toEqual([])
  })

  it('a whole-territory buddy can’t share it onward', async () => {
    await shareWith(anna, joe)
    await expect(
      joe.engine.shareWithBuddies('territory-1', [kim.buddy])
    ).rejects.toMatchObject({ code: 'not_allowed' })
    await expect(joe.engine.createLink('territory-1')).rejects.toMatchObject({
      code: 'not_allowed',
    })
  })

  it('a rekey re-sends open invitations under a new id', async () => {
    await shareWith(anna, joe)
    const { invites } = await anna.engine.shareWithBuddies('territory-1', [
      kim.buddy,
    ])
    await anna.engine.stopSharingWith('territory-1', joe.territory().shared!.me)
    await anna.engine.syncAll()
    expect(anna.reissued).toHaveLength(1)
    expect(anna.reissued[0]?.invite.inviteId).not.toBe(
      invites[0]?.invite.inviteId
    )
    await kim.engine.joinTerritory(anna.reissued[0]!.invite)
    expect(kim.territory().streets).toHaveLength(2)
  })
})

describe('guest links', () => {
  it('a guest reads its streets’ keys, records, and the owner sees it', async () => {
    const { url, linkId } = await anna.engine.createLink('territory-1', [OAK])
    expect(url).toMatch(
      /^https:\/\/beta\.app\.witnesswork\.app\/territories\/guest#v1\./
    )
    const guest = guestFor(server, url)
    const { data } = await guest.keys()
    expect(Object.keys(data.scopes as object)).toEqual([scopeIdForStreet(OAK)])
    expect(data).toMatchObject({ title: '12 · North Hill', from: 'Anna' })
    await guest.recordDoor(OAK, doorId(9), '9', random)
    await anna.engine.syncAll()
    const door = anna.territory().streets[0]!.doors.find((d) => d.label === '9')
    expect(door?.by).toBe('77777777-7777-4777-8777-777777777777')
    expect(anna.territory().shares).toEqual([
      expect.objectContaining({ kind: 'link', id: linkId, streetIds: [OAK] }),
    ])
    const spaceId = anna.territory().shared!.spaceId
    expect(await anna.engine.linkUrl(spaceId, linkId)).toBe(url)
  })

  it('lasts a day unless told, and never past the longest a link may', async () => {
    const DAY = 24 * 60 * 60 * 1000
    const lasts = async (lifetimeMs?: number) => {
      const before = Date.now()
      const { linkId, spaceId } = await anna.engine.createLink(
        'territory-1',
        [OAK],
        lifetimeMs
      )
      const link = server.spaces.get(spaceId)?.links.get(linkId)
      return Math.round(((link?.expiresAt ?? 0) - before) / DAY)
    }
    expect(await lasts()).toBe(1)
    expect(await lasts(7 * DAY)).toBe(7)
    expect(await lasts(400 * DAY)).toBe(30)
  })

  it('changes how long a live link lasts, and the guest keeps the same link', async () => {
    const DAY = 24 * 60 * 60 * 1000
    const { url, linkId, spaceId } = await anna.engine.createLink(
      'territory-1',
      [OAK]
    )
    await new Promise((resolve) => setTimeout(resolve, 2))
    const before = Date.now()
    await anna.engine.setLinkLifetime(spaceId, linkId, 7 * DAY)
    const link = server.spaces.get(spaceId)?.links.get(linkId)
    expect(Math.round(((link?.expiresAt ?? 0) - before) / DAY)).toBe(7)
    expect(
      anna.territory().shares?.find((share) => share.id === linkId)?.expiresAt
    ).toBe(link?.expiresAt)
    const { data } = await guestFor(server, url).keys()
    expect(data.expiresAt).toBe(link?.expiresAt)
    await anna.engine.endLink(spaceId, linkId)
    await expect(
      anna.engine.setLinkLifetime(spaceId, linkId, DAY)
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('ending a link answers the guest gone', async () => {
    const { url, linkId, spaceId } = await anna.engine.createLink('territory-1')
    await anna.engine.endLink(spaceId, linkId)
    const guest = guestFor(server, url)
    const error = await guest.keys().catch((e: unknown) => e)
    expect(isSpaceError(error, 'gone')).toBe(true)
    expect(anna.territory().shares?.[0]?.endedAt).toBeDefined()
  })

  it('creates a link and an invite on a calibrated clock with fractions', async () => {
    const calibrated = territoryPerson(server, 'Cal', random, {
      syncNow: () => Date.now() + 0.7954,
    })
    calibrated.store.getState().save(sampleTerritory())
    const { linkId, spaceId } =
      await calibrated.engine.createLink('territory-1')
    const link = server.spaces.get(spaceId)?.links.get(linkId)
    expect(Number.isInteger(link?.expiresAt)).toBe(true)
    const { invites } = await calibrated.engine.shareWithBuddies(
      'territory-1',
      [joe.buddy]
    )
    expect(Number.isInteger(invites[0]?.invite.expiresAt)).toBe(true)
  })

  it('names an iPhone’s uppercase street ids on the link it shares', async () => {
    const ids: Record<string, string> = {
      [OAK]: 'AB0C1D2E-3F40-4A5B-8C6D-7E8F9A0B1C2D',
      [ELM]: 'CD0E1F2A-3B4C-4D5E-9F6A-7B8C9D0E1F2A',
    }
    const upper = territoryPerson(server, 'Ida', random)
    const territory = sampleTerritory()
    upper.store.getState().save({
      ...territory,
      streets: territory.streets.map((s) => ({ ...s, id: ids[s.id]! })),
      doNotCalls: territory.doNotCalls.map((d) => ({
        ...d,
        ...(d.streetId && { streetId: ids[d.streetId] }),
      })),
    })
    const { linkId } = await upper.engine.createLink('territory-1')
    const view = upper.territory()
    expect(view.shares?.find((s) => s.id === linkId)?.streetIds).toEqual([
      ids[OAK],
      ids[ELM],
    ])
    expect(findLiveLink(view, undefined, Date.now())?.id).toBe(linkId)
  })

  it('after a rekey the creator adds the new epoch’s keys', async () => {
    await shareWith(anna, joe)
    const { url } = await anna.engine.createLink('territory-1')
    await anna.engine.stopSharingWith('territory-1', joe.territory().shared!.me)
    await anna.engine.syncAll()
    const guest = guestFor(server, url)
    const { data } = await guest.keys()
    const scopes = data.scopes as Record<string, Record<string, string>>
    expect(Object.keys(scopes[scopeIdForStreet(OAK)]!)).toEqual(['1', '2'])
  })
})

describe('hand-offs', () => {
  it('hands a street to a new buddy, pending until they accept', async () => {
    const result = await anna.engine.handOff('territory-1', OAK, joe.buddy)
    expect(result.kind).toBe('invite')
    expect(anna.territory().streets[0]?.handoff).toMatchObject({
      pending: true,
    })
    if (result.kind !== 'invite') return
    await joe.engine.joinTerritory(result.invite)
    await anna.engine.syncAll()
    expect(anna.territory().streets[0]?.handoff).toMatchObject({
      personId: joe.territory().shared!.me,
    })
    expect(anna.territory().streets[0]?.handoff?.pending).toBeUndefined()
    expect(joe.territory().received?.kind).toBe('handoff')
    expect(joe.territory().streets.map((s) => s.id)).toEqual([OAK])
  })

  it('the owner can’t write a handed-off street; the holder can, and shares onward', async () => {
    await shareWith(anna, joe)
    const handed = await anna.engine.handOff('territory-1', OAK, joe.buddy)
    expect(handed.kind).toBe('existing')
    await joe.engine.syncAll()
    expect(joe.territory().shared?.holds).toEqual([OAK])

    record(anna, OAK, '7', doorId(7))
    expect(
      anna.territory().streets[0]?.doors.some((d) => d.label === '7')
    ).toBe(false)

    record(joe, OAK, '8', doorId(8))
    await joe.engine.syncAll()

    const onward = await joe.engine.shareWithBuddies(
      'territory-1',
      [kim.buddy],
      [OAK]
    )
    await kim.engine.joinTerritory(onward.invites[0]!.invite)
    await joe.engine.syncAll()
    await anna.engine.syncAll()
    const kimId = kim.territory().shared!.me
    expect(anna.territory().shares).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          personId: kimId,
          by: joe.territory().shared!.me,
          streetIds: [OAK],
        }),
      ])
    )
    expect(kim.territory().received?.from.name).toBe('Joe')
    expect(kim.territory().streets[0]?.doors.some((d) => d.label === '8')).toBe(
      true
    )
  })

  it('a holder sharing all their streets shares just those', async () => {
    await shareWith(anna, joe, [ELM])
    await anna.engine.handOff('territory-1', OAK, joe.buddy)
    await joe.engine.syncAll()
    expect(joe.territory().shared?.holds).toEqual([OAK])
    const onward = await joe.engine.shareWithBuddies('territory-1', [kim.buddy])
    expect(onward.invites[0]?.invite.streets).toEqual(['Oak Street'])
    await kim.engine.joinTerritory(onward.invites[0]!.invite)
    expect(kim.territory().streets.map((street) => street.id)).toEqual([OAK])
  })

  it('a holder can’t hand the street off again, and the server refuses it too', async () => {
    await shareWith(anna, joe)
    await anna.engine.handOff('territory-1', OAK, joe.buddy)
    await joe.engine.syncAll()
    await expect(
      joe.engine.handOff('territory-1', OAK, kim.buddy)
    ).rejects.toMatchObject({ code: 'not_owner' })
  })

  it('take back ends the holder’s onward shares and their links', async () => {
    const result = await anna.engine.handOff('territory-1', OAK, joe.buddy)
    if (result.kind !== 'invite') throw new Error('expected an invite')
    await joe.engine.joinTerritory(result.invite)
    const { url } = await joe.engine.createLink('territory-1')
    await anna.engine.endHandoff('territory-1', OAK)
    expect(anna.territory().streets[0]?.handoff).toBeUndefined()
    const guest = guestFor(server, url)
    expect(
      isSpaceError(await guest.keys().catch((e: unknown) => e), 'gone')
    ).toBe(true)
    await joe.engine.syncAll()
    const spaceId = anna.territory().shared!.spaceId
    expect(joe.territory(endedCopyId(spaceId)).received?.endedAt).toBeDefined()
  })

  it('taking a street back from someone with other streets drops it from their device', async () => {
    await shareWith(anna, joe, [ELM])
    await anna.engine.handOff('territory-1', OAK, joe.buddy)
    await joe.engine.syncAll()
    expect(joe.territory().streets.map((street) => street.id)).toEqual([
      OAK,
      ELM,
    ])
    await anna.engine.endHandoff('territory-1', OAK)
    await joe.engine.syncAll()
    expect(joe.territory().streets.map((street) => street.id)).toEqual([ELM])
    expect(joe.territory().received?.endedAt).toBeUndefined()
  })

  it('give back returns the street to the owner', async () => {
    await shareWith(anna, joe)
    await anna.engine.handOff('territory-1', OAK, joe.buddy)
    await joe.engine.syncAll()
    await joe.engine.endHandoff('territory-1', OAK)
    await anna.engine.syncAll()
    expect(anna.territory().streets[0]?.handoff).toBeUndefined()
    expect(joe.outcomes).toContainEqual({
      type: 'handoff',
      action: 'given_back',
    })
  })
})

describe('refused writes', () => {
  it('a change to a street handed off meanwhile is dropped and the User told once', async () => {
    await shareWith(anna, joe)
    record(joe, ELM, '3', doorId(3))
    await anna.engine.handOff('territory-1', ELM, kim.buddy)
    await joe.engine.syncAll()
    expect(joe.refused).toEqual(['12 · North Hill'])
    await joe.engine.syncAll()
    expect(joe.territory().streets.find((s) => s.id === ELM)?.doors).toEqual([])
    expect(joe.refused).toHaveLength(1)
  })
})

describe('returning and privacy', () => {
  it('returning deletes the space and leaves everyone a copy without door records', async () => {
    await shareWith(anna, joe)
    const spaceId = anna.territory().shared!.spaceId
    await anna.engine.returnTerritory('territory-1')
    expect(server.isDeleted(spaceId)).toBe(true)
    const returned = anna.territory()
    expect(returned.shared).toBeUndefined()
    expect(returned.finishedAt).toBeDefined()
    expect(returned.streets.every((s) => s.doors.length === 0)).toBe(true)
    await joe.engine.syncAll()
    const copy = joe.territory(endedCopyId(spaceId))
    expect(copy.received?.endedAt).toBeDefined()
    expect(copy.doNotCalls.length).toBeGreaterThan(0)
  })

  it('the owner’s privacy mode turns doors into do-not-calls for everyone', async () => {
    await shareWith(anna, joe)
    anna.update('territory-1', (t) =>
      updateStreet(t, OAK, (street) =>
        logDoor(street, {
          id: doorId(4),
          label: '4',
          outcome: 'doNotCall',
          at: Date.now(),
        })
      )
    )
    await anna.engine.syncAll()
    anna.setPrivacy(true)
    await anna.engine.syncAll()
    await joe.engine.syncAll()
    const seen = joe.territory()
    expect(seen.shared?.houseRecords).toBe(false)
    expect(seen.streets[0]?.doors).toEqual([])
    expect(seen.doNotCalls.some((d) => d.label === '4')).toBe(true)
  })

  it('a member’s own privacy mode keeps door records off their device', async () => {
    await shareWith(anna, joe)
    joe.setPrivacy(true)
    joe.engine.resyncWithoutPrivacy()
    await joe.engine.syncAll()
    const space = Object.values(joe.store.getState().spaces)[0]!
    expect(Object.values(space.records).some((r) => r.kind === 'door')).toBe(
      false
    )
    joe.setPrivacy(false)
    joe.engine.resyncWithoutPrivacy()
    await joe.engine.syncAll()
    expect(joe.territory().streets[0]?.doors).toHaveLength(1)
  })
})

describe('the member tag', () => {
  it('names the buddy who joined', async () => {
    await shareWith(anna, joe)
    const spaceId = anna.territory().shared!.spaceId
    const space = anna.store.getState().spaces[spaceId]!
    expect(space.records[`m.${joe.territory().shared!.me}`]?.data?.tag).toBe(
      memberTag(spaceId, joe.inboxId)
    )
  })
})
