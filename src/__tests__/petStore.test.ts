import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import usePet, { cleanPetName } from '@/stores/pet'
import { DEFAULT_ROOM, PET_WAKES_KEPT } from '@/types/pet'

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
