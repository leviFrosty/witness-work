import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import usePet, { cleanPetName } from '@/stores/pet'
import {
  DEFAULT_ROOM,
  PET_WAKES_KEPT,
  UNLOCK_ORDER,
  type PetRecord,
} from '@/types/pet'

const reset = () => usePet.getState()._WARNING_forceDeletePet()
type AdoptArgs = Parameters<ReturnType<typeof usePet.getState>['adopt']>[0]
const adopt = (extra: Partial<AdoptArgs> = {}) =>
  usePet.getState().adopt({
    species: 'dog',
    coat: 'liver',
    name: 'Rex',
    today: '2026-10-01',
    ...extra,
  })

describe('pet store', () => {
  beforeEach(reset)

  it('adopts one companion with a stamp, keeping the first', () => {
    adopt()
    const { pet } = usePet.getState()
    expect(pet).toMatchObject({
      id: 'companion',
      species: 'dog',
      coat: 'liver',
      name: 'Rex',
      adoptedOn: '2026-10-01',
      wakes: [],
      keepsakes: [],
    })
    expect(pet!.updatedAt).toBeGreaterThan(0)

    adopt({ species: 'cat', coat: 'calico', today: '2026-10-05' })
    expect(usePet.getState().pet).toBe(pet)
  })

  it('falls back to the species default coat', () => {
    adopt({ species: 'lion', coat: 'liver' })
    expect(usePet.getState().pet?.coat).toBe('default')
    usePet.getState().changeAppearance({ species: 'cat', coat: 'purple' })
    expect(usePet.getState().pet?.coat).toBe('orange')
  })

  it('changes appearance without losing name, adoption or keepsakes', () => {
    adopt()
    usePet.getState().collectKeepsake('fig', '2026-10-03')
    const before = usePet.getState().pet!
    usePet.getState().changeAppearance({ species: 'cat', coat: 'siamese' })
    const after = usePet.getState().pet!
    expect(after).toMatchObject({
      species: 'cat',
      coat: 'siamese',
      name: 'Rex',
      adoptedOn: '2026-10-01',
      keepsakes: [{ kind: 'fig', on: '2026-10-03' }],
    })
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt)
  })

  it('renames, trimming to 20 characters, and clears an empty name', () => {
    adopt({ name: undefined })
    expect(usePet.getState().pet).not.toHaveProperty('name')
    usePet.getState().rename('  Barnabas the very good boy  ')
    expect(usePet.getState().pet?.name).toBe('Barnabas the very go')
    usePet.getState().rename('   ')
    expect(usePet.getState().pet).not.toHaveProperty('name')
    expect(cleanPetName('🐑🐑🐑')).toBe('🐑🐑🐑')
  })

  it('records a wake once per day and keeps every one the replay needs', () => {
    adopt()
    for (let day = 1; day <= 31; day++)
      usePet.getState().recordWake(`2026-01-${String(day).padStart(2, '0')}`)
    usePet.getState().recordWake('2026-01-31')
    usePet.getState().recordWake('not a day')
    const { wakes } = usePet.getState().pet!
    // Far under the cap, so none is dropped.
    expect(wakes).toHaveLength(31)
    expect(wakes[0]).toBe('2026-01-01')
    expect(wakes.at(-1)).toBe('2026-01-31')
  })

  it('drops only wakes over the cap and over 400 days before the newest', () => {
    adopt()
    const day = (n: number) =>
      new Date(Date.UTC(2020, 0, 1) + n * 86_400_000).toISOString().slice(0, 10)
    // 130 wakes ten days apart: 1,290 days.
    for (let n = 0; n < 130; n++) usePet.getState().recordWake(day(n * 10))
    const { wakes } = usePet.getState().pet!
    expect(wakes).toHaveLength(PET_WAKES_KEPT)
    expect(wakes[0]).toBe(day(100))
    expect(wakes.at(-1)).toBe(day(1290))
  })

  it('gives each adopted pet its own gift seed', () => {
    adopt()
    const first = usePet.getState().pet!.seed
    expect(first).toMatch(/^[0-9a-z]{14}$/)
    usePet.getState().releaseCompanion()
    adopt()
    expect(usePet.getState().pet!.seed).not.toBe(first)
    // Edits keep it.
    usePet.getState().rename('Max')
    usePet.getState().recordWake('2026-10-02')
    expect(usePet.getState().pet!.seed).toBeDefined()
  })

  it('collects a keepsake once per day and keeps the newest 20', () => {
    adopt()
    const { collectKeepsake } = usePet.getState()
    collectKeepsake('olive', '2026-02-01')
    const stamped = usePet.getState().pet!
    collectKeepsake('fig', '2026-02-01')
    expect(usePet.getState().pet).toBe(stamped)
    for (let day = 2; day <= 22; day++)
      collectKeepsake('pebble', `2026-02-${String(day).padStart(2, '0')}`)
    const { keepsakes } = usePet.getState().pet!
    expect(keepsakes).toHaveLength(20)
    expect(keepsakes[0].on).toBe('2026-02-03')
    expect(keepsakes.at(-1)?.on).toBe('2026-02-22')
  })

  it('stores earned room items once each, in unlock order, through Change Pet', () => {
    expect(usePet.getState().earnRoomItems([UNLOCK_ORDER[0]])).toEqual([])
    expect(usePet.getState().pet).toBeNull()

    adopt()
    expect(usePet.getState().pet).not.toHaveProperty('earnedRoomItems')
    const before = usePet.getState().pet!
    expect(
      usePet
        .getState()
        .earnRoomItems([UNLOCK_ORDER[2], UNLOCK_ORDER[0], UNLOCK_ORDER[2]])
    ).toEqual([UNLOCK_ORDER[2], UNLOCK_ORDER[0]])
    const after = usePet.getState().pet!
    expect(after.earnedRoomItems).toEqual([UNLOCK_ORDER[0], UNLOCK_ORDER[2]])
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt)

    // A second caller with the same items adds nothing and keeps the stamp.
    expect(
      usePet.getState().earnRoomItems([UNLOCK_ORDER[0], UNLOCK_ORDER[2]])
    ).toEqual([])
    expect(usePet.getState().pet).toBe(after)

    usePet.getState().changeAppearance({ species: 'cat', coat: 'grey' })
    expect(usePet.getState().pet!.earnedRoomItems).toEqual([
      UNLOCK_ORDER[0],
      UNLOCK_ORDER[2],
    ])
  })

  it('keeps earned room items from a newer build', () => {
    adopt()
    const pet = usePet.getState().pet!
    usePet.setState({
      pet: { ...pet, earnedRoomItems: ['floor:marble'] } as PetRecord,
    })
    expect(usePet.getState().earnRoomItems([UNLOCK_ORDER[1]])).toEqual([
      UNLOCK_ORDER[1],
    ])
    expect(usePet.getState().pet!.earnedRoomItems).toEqual([
      UNLOCK_ORDER[1],
      'floor:marble',
    ])
  })

  it('stores a purchase once per item, and none for an owned item', () => {
    const purchase = {
      item: 'hat:bow',
      currency: 'thread',
      price: 5,
      on: '2026-10-02',
    } as const
    expect(usePet.getState().buyRoomItem(purchase)).toBe(false)

    adopt()
    const before = usePet.getState().pet!
    expect(usePet.getState().buyRoomItem(purchase)).toBe(true)
    const after = usePet.getState().pet!
    expect(after.purchases).toEqual([purchase])
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt)
    // Bought already, earned already, or on an unreadable day: nothing.
    expect(usePet.getState().buyRoomItem({ ...purchase, price: 3 })).toBe(false)
    usePet.getState().earnRoomItems([UNLOCK_ORDER[0]])
    expect(
      usePet.getState().buyRoomItem({ ...purchase, item: UNLOCK_ORDER[0] })
    ).toBe(false)
    expect(
      usePet.getState().buyRoomItem({ ...purchase, item: 'hat:cap', on: 'now' })
    ).toBe(false)
    expect(usePet.getState().pet!.purchases).toEqual([purchase])

    // Change Pet keeps what was bought.
    usePet.getState().changeAppearance({ species: 'cat', coat: 'grey' })
    expect(usePet.getState().pet!.purchases).toEqual([purchase])
  })

  it('does nothing to a pet that was never adopted', () => {
    usePet.getState().rename('Rex')
    usePet.getState().recordWake('2026-01-01')
    usePet.getState().collectKeepsake('lily', '2026-01-01')
    expect(usePet.getState().pet).toBeNull()
  })

  it('creates the room from the given defaults and stamps every change', () => {
    usePet
      .getState()
      .updateRoom({ floor: 'stone' }, { ...DEFAULT_ROOM, sign: 'shared' })
    const first = usePet.getState().room!
    expect(first).toMatchObject({
      ...DEFAULT_ROOM,
      id: 'room',
      floor: 'stone',
      sign: 'shared',
    })
    usePet.getState().updateRoom({ window: { time: 'night', season: 'live' } })
    const second = usePet.getState().room!
    expect(second.window).toEqual({ time: 'night', season: 'live' })
    expect(second.floor).toBe('stone')
    expect(second.sign).toBe('shared')
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt)
  })

  it('releases the companion and room with tombstones', () => {
    adopt()
    usePet.getState().updateRoom({ bed: 'hay' })
    usePet.getState().earnRoomItems([UNLOCK_ORDER[0]])
    const { pet, room } = usePet.getState()
    usePet.getState().releaseCompanion()
    const after = usePet.getState()
    expect(after.pet).toBeNull()
    expect(after.room).toBeNull()
    expect(after.deletedPetRecords.map((t) => t.id).sort()).toEqual([
      'companion',
      'room',
    ])
    const petTombstone = after.deletedPetRecords.find(
      (t) => t.id === 'companion'
    )!
    expect(petTombstone.deletedAt).toBeGreaterThan(pet!.updatedAt)
    expect(
      after.deletedPetRecords.find((t) => t.id === 'room')!.deletedAt
    ).toBeGreaterThan(room!.updatedAt)

    // Adopting again outranks the tombstone, so it survives a merge.
    adopt({ species: 'lamb', coat: 'default', today: '2026-11-01' })
    expect(usePet.getState().pet!.updatedAt).toBeGreaterThan(
      petTombstone.deletedAt
    )
    expect(usePet.getState().pet!.adoptedOn).toBe('2026-11-01')
    // The new companion starts its room items over.
    expect(usePet.getState().pet).not.toHaveProperty('earnedRoomItems')
  })

  it('force delete clears the records and tombstones', () => {
    adopt()
    usePet.getState().releaseCompanion()
    usePet.getState()._WARNING_forceDeletePet()
    expect(usePet.getState()).toMatchObject({
      pet: null,
      room: null,
      deletedPetRecords: [],
    })
  })
})
