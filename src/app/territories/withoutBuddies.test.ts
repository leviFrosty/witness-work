import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isSpaceError } from '@/lib/sharedSpaces/client'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import {
  createFakeSpacesServer,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { markedSpaces } from '@/features/territories/lib/personalSync'
import { startLink } from '@/app/territories/startLink'
import {
  doorId,
  guestFor,
  OAK,
  sampleTerritory,
  type TerritoryTestPerson,
  territoryPerson,
} from '@/app/territories/testing/territoryPeople'
import { createTerritoryProfile } from '@/app/territories/territoryProfile'

const toasts = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock('@/stores/toasts', () => ({ toast: toasts }))
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
let seed: Uint8Array
let buddiesInbox: string | null
let anna: TerritoryTestPerson
let joe: TerritoryTestPerson

const annaProfile = (accountKey: () => Uint8Array) =>
  createTerritoryProfile({
    buddies: () => ({ name: 'Anna B.', inboxId: buddiesInbox! }),
    buddiesStarted: () => buddiesInbox !== null,
    accountKey: async () => accountKey(),
    name: () => 'Anna',
  })

const ownerRecord = (person: TerritoryTestPerson, spaceId: string) => {
  const space = person.store.getState().spaces[spaceId]!
  return space.records[`m.${space.myMemberId}`]?.data
}

beforeEach(() => {
  toasts.error.mockReset()
  server = createFakeSpacesServer({ now: Date.now })
  seed = random(32)
  buddiesInbox = null
  anna = territoryPerson(
    server,
    'Anna',
    random,
    { profile: annaProfile(() => seed) },
    { seed }
  )
  joe = territoryPerson(server, 'Joe', random)
  anna.store.getState().save(sampleTerritory())
})

describe('a guest link without Buddies', () => {
  it('starts, carries guests’ doors back, and ends', async () => {
    const link = await startLink(() =>
      anna.engine.createLink('territory-1', [OAK])
    )
    expect(toasts.error).not.toHaveBeenCalled()
    expect(link?.url).toMatch(/territories\/guest#v1\./)

    const guest = guestFor(server, link!.url)
    const { data } = await guest.keys()
    expect(data.from).toBe('Anna')
    await guest.recordDoor(OAK, doorId(9), '9', random)
    await anna.engine.syncAll()
    expect(
      anna.territory().streets[0]?.doors.some((door) => door.label === '9')
    ).toBe(true)

    const spaceId = anna.territory().shared!.spaceId
    await anna.engine.endLink(spaceId, link!.linkId)
    expect(
      isSpaceError(await guest.keys().catch((e: unknown) => e), 'gone')
    ).toBe(true)
  })

  it('names the sharer with the inbox id Buddies will use later', async () => {
    const { spaceId } = await anna.engine.createLink('territory-1')
    expect(ownerRecord(anna, spaceId)).toMatchObject({
      name: 'Anna',
      tag: memberTag(spaceId, deriveIdentity(seed).inboxId),
    })
  })

  it('keeps the same member once Buddies is set up, and buddies can join', async () => {
    const { spaceId, url } = await anna.engine.createLink('territory-1')
    const me = anna.territory().shared!.me
    const tag = ownerRecord(anna, spaceId)?.tag

    buddiesInbox = deriveIdentity(seed).inboxId
    const { invites } = await anna.engine.shareWithBuddies('territory-1', [
      joe.buddy,
    ])
    await joe.engine.joinTerritory(invites[0]!.invite)
    await anna.engine.syncAll()

    expect(anna.territory().shared).toMatchObject({ spaceId, me })
    expect(ownerRecord(anna, spaceId)?.tag).toBe(tag)
    expect(server.spaces.get(spaceId)?.members.size).toBe(2)
    expect(joe.territory().received?.from.name).toBe('Anna B.')
    expect((await guestFor(server, url).keys()).data.title).toBe(
      '12 · North Hill'
    )
  })

  it('says it couldn’t start, not that Buddies is needed, without an account key', async () => {
    const keyless = territoryPerson(server, 'Sam', random, {
      rootSeed: async () => null,
    })
    keyless.store.getState().save(sampleTerritory())
    expect(
      await startLink(() => keyless.engine.createLink('territory-1'))
    ).toBeNull()
    expect(toasts.error).toHaveBeenCalledWith(
      'territories.share.startFailed_toast'
    )
    expect(server.spaces.size).toBe(0)
  })
})

describe('the sharer’s other device without Buddies', () => {
  it('finds the space from the synced mark and sees the guests’ doors', async () => {
    anna.store.getState().stampLedger()
    const { url, linkId, spaceId } = await anna.engine.createLink(
      'territory-1',
      [OAK]
    )
    anna.store.getState().stampLedger()
    await guestFor(server, url).recordDoor(OAK, doorId(9), '9', random)

    const [mark] = markedSpaces(anna.store.getState().ledger)
    expect(mark).toMatchObject({
      territoryId: 'territory-1',
      spaceId,
      ownerId: anna.territory().shared!.me,
    })

    const other = territoryPerson(
      server,
      'Anna',
      random,
      { profile: annaProfile(() => seed) },
      { seed }
    )
    other.store.setState({ ledger: anna.store.getState().ledger })
    expect(await other.engine.adoptOwnSpace(mark!)).toBe('synced')

    const seen = other.territory()
    expect(seen.shared).toMatchObject({ spaceId, role: 'owner' })
    expect(seen.streets[0]?.doors.some((door) => door.label === '9')).toBe(true)
    expect(await other.engine.linkUrl(spaceId, linkId)).toBe(url)
    await other.engine.endLink(spaceId, linkId)
    expect(
      isSpaceError(
        await guestFor(server, url)
          .keys()
          .catch((e: unknown) => e),
        'gone'
      )
    ).toBe(true)
  })

  it('leaves a space alone when the mark is another account’s', async () => {
    anna.store.getState().stampLedger()
    await anna.engine.createLink('territory-1')
    anna.store.getState().stampLedger()
    const [mark] = markedSpaces(anna.store.getState().ledger)
    expect(await joe.engine.adoptOwnSpace(mark!)).toBe('skipped')
    expect(joe.store.getState().spaces).toEqual({})
  })
})
