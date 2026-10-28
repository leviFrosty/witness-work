import { describe, expect, it } from 'vitest'
import { mergePayload } from '@/app/sync/merge'
import { foldRemotePayloads } from '@/app/sync/foldRemotePayloads'
import { payloadSchema } from '@/app/sync/payloadValidation'
import type { SyncPayload } from '@/app/sync/payload'
import {
  DEFAULT_ROOM,
  UNLOCK_ORDER,
  type PetRecord,
  type PetRoomRecord,
} from '@/types/pet'

const emptyLocal = (): Parameters<typeof mergePayload>[0] => ({
  contacts: [],
  deletedContacts: [],
  customFieldDefs: [],
  deletedCustomFieldDefs: [],
  conversations: [],
  deletedConversations: [],
  serviceReports: {},
  dayPlans: [],
  recurringPlans: [],
  deletedServiceReports: [],
  categories: [],
  deletedCategories: [],
  vehicles: [],
  fuels: [],
  fuelPrices: [],
  vehicleSetups: [],
  trips: [],
  deletedMileageRecords: [],
  pets: [],
  petRooms: [],
  deletedPetRecords: [],
  preferencesValues: {},
  preferenceUpdatedAt: {},
  profileValues: {},
  profileUpdatedAt: {},
})

const remote = (pet?: SyncPayload['petStore']): SyncPayload => ({
  version: 1,
  writtenAt: 1_000,
  deviceId: 'peer',
  contactStore: { contacts: [], deletedContacts: [] },
  conversationStore: { conversations: [] },
  serviceReportStore: { serviceReports: {}, dayPlans: [], recurringPlans: [] },
  ...(pet ? { petStore: pet } : {}),
  preferencesStore: { values: {}, updatedAt: {} },
})

const emptyPet = () => ({
  pets: [] as PetRecord[],
  petRooms: [] as PetRoomRecord[],
  deletedPetRecords: [] as { id: string; deletedAt: number }[],
})

const companion: PetRecord = {
  id: 'companion',
  species: 'dog',
  coat: 'gold',
  name: 'Rex',
  adoptedOn: '2026-09-01',
  wakes: ['2026-09-20'],
  keepsakes: [{ kind: 'olive', on: '2026-10-02' }],
  updatedAt: 100,
}
const room: PetRoomRecord = {
  ...DEFAULT_ROOM,
  id: 'room',
  floor: 'stone',
  updatedAt: 100,
}

describe('pet sync merge', () => {
  it('keeps the local pet when the peer predates the feature', () => {
    const local = { ...emptyLocal(), pets: [companion], petRooms: [room] }
    const result = mergePayload(local, remote())
    expect(result.pets).toEqual([companion])
    expect(result.petRooms).toEqual([room])
    expect(result.changed).toBe(false)
  })

  it('adopts the remote pet and keeps the newer edit', () => {
    const renamed = { ...companion, name: 'Max', updatedAt: 200 }
    const result = mergePayload(
      { ...emptyLocal(), pets: [companion] },
      remote({ ...emptyPet(), pets: [renamed], petRooms: [room] })
    )
    expect(result.pets).toEqual([renamed])
    expect(result.petRooms).toEqual([room])
    expect(result.changed).toBe(true)

    const stale = mergePayload(
      { ...emptyLocal(), pets: [renamed] },
      remote({ ...emptyPet(), pets: [companion] })
    )
    expect(stale.pets).toEqual([renamed])
    expect(stale.changed).toBe(false)
  })

  it('applies a release from another device to the pet and room', () => {
    const result = mergePayload(
      { ...emptyLocal(), pets: [companion], petRooms: [room] },
      remote({
        ...emptyPet(),
        deletedPetRecords: [
          { id: 'companion', deletedAt: 150 },
          { id: 'room', deletedAt: 150 },
        ],
      })
    )
    expect(result.pets).toEqual([])
    expect(result.petRooms).toEqual([])
    expect(result.deletedPetRecords).toHaveLength(2)
  })

  it('keeps a pet adopted again after the release', () => {
    const readopted = {
      ...companion,
      species: 'lamb' as const,
      coat: 'default',
      adoptedOn: '2026-10-10',
      updatedAt: 300,
    }
    const result = mergePayload(
      {
        ...emptyLocal(),
        pets: [readopted],
        deletedPetRecords: [{ id: 'companion', deletedAt: 150 }],
      },
      remote({ ...emptyPet(), pets: [companion] })
    )
    expect(result.pets).toEqual([readopted])
  })

  it('keeps wakes and keepsakes from both sides of a concurrent edit', () => {
    const local: PetRecord = {
      ...companion,
      seed: 'abc',
      wakes: ['2026-09-20', '2026-10-05'],
      keepsakes: [{ kind: 'olive', on: '2026-10-02' }],
      updatedAt: 100,
    }
    // Renamed on another device that hadn't seen the Oct 5 wake, and kept a fig.
    const renamed: PetRecord = {
      ...companion,
      seed: 'abc',
      name: 'Max',
      wakes: ['2026-09-20', '2026-10-12'],
      keepsakes: [
        { kind: 'olive', on: '2026-10-02' },
        { kind: 'fig', on: '2026-10-09' },
      ],
      updatedAt: 200,
    }
    const result = mergePayload(
      { ...emptyLocal(), pets: [local] },
      remote({ ...emptyPet(), pets: [renamed] })
    )
    expect(result.pets).toEqual([
      {
        ...renamed,
        wakes: ['2026-09-20', '2026-10-05', '2026-10-12'],
        keepsakes: [
          { kind: 'olive', on: '2026-10-02' },
          { kind: 'fig', on: '2026-10-09' },
        ],
      },
    ])
    expect(result.changed).toBe(true)

    // The other device ends up with the same record.
    const back = mergePayload(
      { ...emptyLocal(), pets: [renamed] },
      remote({ ...emptyPet(), pets: result.pets })
    )
    expect(back.pets).toEqual(result.pets)
    // And merging it again changes nothing.
    expect(
      mergePayload(
        { ...emptyLocal(), pets: result.pets },
        remote({ ...emptyPet(), pets: [local] })
      ).changed
    ).toBe(false)
  })

  it('keeps room items earned on either side, so none locks again', () => {
    const local: PetRecord = {
      ...companion,
      seed: 'abc',
      earnedRoomItems: [UNLOCK_ORDER[0], UNLOCK_ORDER[1], 'floor:marble'],
      updatedAt: 100,
    }
    // Renamed on another device, which had earned only the first, plus a third
    // in the meantime.
    const renamed: PetRecord = {
      ...companion,
      seed: 'abc',
      name: 'Max',
      earnedRoomItems: [UNLOCK_ORDER[0], UNLOCK_ORDER[2]],
      updatedAt: 200,
    }
    const result = mergePayload(
      { ...emptyLocal(), pets: [local] },
      remote({ ...emptyPet(), pets: [renamed] })
    )
    expect(result.pets).toEqual([
      {
        ...renamed,
        earnedRoomItems: [
          UNLOCK_ORDER[0],
          UNLOCK_ORDER[1],
          UNLOCK_ORDER[2],
          'floor:marble',
        ],
      },
    ])
    expect(result.changed).toBe(true)
    expect(
      mergePayload(
        { ...emptyLocal(), pets: result.pets },
        remote({ ...emptyPet(), pets: [local] })
      ).changed
    ).toBe(false)

    // A newer copy from a build without the list keeps the earned ones.
    const older = { ...companion, seed: 'abc', updatedAt: 300 }
    expect(
      mergePayload(
        { ...emptyLocal(), pets: [local] },
        remote({ ...emptyPet(), pets: [older] })
      ).pets[0].earnedRoomItems
    ).toEqual(local.earnedRoomItems)
    // Neither side earned any: no list is added.
    const plain = mergePayload(
      { ...emptyLocal(), pets: [companion] },
      remote({
        ...emptyPet(),
        pets: [{ ...companion, name: 'Max', updatedAt: 200 }],
      })
    ).pets[0]
    expect(plain).not.toHaveProperty('earnedRoomItems')
  })

  it('keeps purchases from either side, each item paid for once', () => {
    const bought = (item: string, on: string, price: number) => ({
      item,
      currency: 'thread' as const,
      price,
      on,
    })
    const local: PetRecord = {
      ...companion,
      seed: 'abc',
      purchases: [
        bought('hat:bow', '2026-10-02', 5),
        bought('hat:cap', '2026-10-04', 6),
      ],
      updatedAt: 100,
    }
    // Offline, the other device bought the cap first, and a floor.
    const peer: PetRecord = {
      ...companion,
      seed: 'abc',
      name: 'Max',
      purchases: [
        bought('hat:cap', '2026-10-03', 6),
        bought('floor:stone', '2026-10-03', 7),
      ],
      updatedAt: 200,
    }
    const result = mergePayload(
      { ...emptyLocal(), pets: [local] },
      remote({ ...emptyPet(), pets: [peer] })
    )
    expect(result.pets[0].name).toBe('Max')
    expect(result.pets[0].purchases).toEqual([
      bought('hat:bow', '2026-10-02', 5),
      bought('floor:stone', '2026-10-03', 7),
      bought('hat:cap', '2026-10-03', 6),
    ])
    expect(
      mergePayload(
        { ...emptyLocal(), pets: result.pets },
        remote({ ...emptyPet(), pets: [peer] })
      ).changed
    ).toBe(false)
    // A newer copy from a build before the Shop keeps the purchases.
    const older = { ...companion, seed: 'abc', updatedAt: 300 }
    expect(
      mergePayload(
        { ...emptyLocal(), pets: [local] },
        remote({ ...emptyPet(), pets: [older] })
      ).pets[0].purchases
    ).toEqual(local.purchases)
    // Neither side bought any: no list is added.
    expect(
      mergePayload(
        { ...emptyLocal(), pets: [companion] },
        remote({
          ...emptyPet(),
          pets: [{ ...companion, name: 'Max', updatedAt: 200 }],
        })
      ).pets[0]
    ).not.toHaveProperty('purchases')
  })

  it('caps the merged keepsakes at the newest 20', () => {
    const day = (n: number) =>
      `2026-0${1 + Math.floor(n / 28)}-${String(1 + (n % 28)).padStart(2, '0')}`
    const mine = {
      ...companion,
      keepsakes: Array.from({ length: 15 }, (_, i) => ({
        kind: 'fig' as const,
        on: day(i * 2),
      })),
      updatedAt: 100,
    }
    const theirs = {
      ...companion,
      keepsakes: Array.from({ length: 15 }, (_, i) => ({
        kind: 'olive' as const,
        on: day(i * 2 + 1),
      })),
      updatedAt: 200,
    }
    const [merged] = mergePayload(
      { ...emptyLocal(), pets: [mine] },
      remote({ ...emptyPet(), pets: [theirs] })
    ).pets
    expect(merged.keepsakes).toHaveLength(20)
    expect(merged.keepsakes[0].on).toBe(day(10))
    expect(merged.keepsakes.at(-1)!.on).toBe(day(29))
  })

  it("doesn't mix in a released pet's or a separate adoption's history", () => {
    const readopted: PetRecord = {
      ...companion,
      adoptedOn: '2026-10-10',
      seed: 'new',
      wakes: [],
      keepsakes: [],
      updatedAt: 300,
    }
    const old: PetRecord = { ...companion, seed: 'old', updatedAt: 100 }
    const result = mergePayload(
      {
        ...emptyLocal(),
        pets: [readopted],
        deletedPetRecords: [{ id: 'companion', deletedAt: 150 }],
      },
      remote({ ...emptyPet(), pets: [old] })
    )
    expect(result.pets).toEqual([readopted])

    // Two devices that each adopted on the same day, before syncing.
    const elsewhere: PetRecord = {
      ...companion,
      seed: 'other',
      wakes: ['2026-10-01'],
      updatedAt: 50,
    }
    const mine: PetRecord = { ...companion, seed: 'mine', updatedAt: 60 }
    expect(
      mergePayload(
        { ...emptyLocal(), pets: [mine] },
        remote({ ...emptyPet(), pets: [elsewhere] })
      ).pets
    ).toEqual([mine])
  })

  it('carries the pet through a folded restore', () => {
    const folded = foldRemotePayloads([
      remote({ ...emptyPet(), pets: [companion], petRooms: [room] }),
    ])
    expect(folded?.petStore?.pets).toEqual([companion])
    expect(folded?.petStore?.petRooms).toEqual([room])
  })

  it('validates the wire shape', () => {
    const valid = remote({ ...emptyPet(), pets: [companion], petRooms: [room] })
    expect(payloadSchema.safeParse(valid).success).toBe(true)
    expect(payloadSchema.safeParse(remote()).success).toBe(true)
    // Options from a newer build still read.
    const newer = remote({
      ...emptyPet(),
      pets: [{ ...companion, coat: 'spotted' }],
      petRooms: [{ ...room, floor: 'marble' as PetRoomRecord['floor'] }],
    })
    expect(payloadSchema.safeParse(newer).success).toBe(true)
    expect(
      payloadSchema.safeParse(
        remote({ ...emptyPet(), pets: [{ ...companion, seed: 'k3x9q2' }] })
      ).success
    ).toBe(true)
    expect(
      payloadSchema.safeParse(
        remote({
          ...emptyPet(),
          pets: [
            {
              ...companion,
              earnedRoomItems: [UNLOCK_ORDER[0], 'floor:marble'],
            },
          ],
        })
      ).success
    ).toBe(true)
    for (const bad of [
      { ...companion, adoptedOn: 'September 1' },
      { ...companion, earnedRoomItems: 'bed:cushion' },
      { ...companion, earnedRoomItems: [7] },
      { ...companion, species: 'dragon' },
      { ...companion, wakes: ['soon'] },
      { ...companion, seed: '' },
      { ...companion, seed: 7 },
    ])
      expect(
        payloadSchema.safeParse(
          remote({ ...emptyPet(), pets: [bad as PetRecord] })
        ).success
      ).toBe(false)
  })
})
