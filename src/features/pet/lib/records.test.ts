import { describe, expect, it } from 'vitest'
import { readPet, readRoom } from '@/features/pet/lib/records'
import { DEFAULT_ROOM, type PetRecord, type PetRoomRecord } from '@/types/pet'

const pet: PetRecord = {
  id: 'companion',
  species: 'cat',
  coat: 'tuxedo',
  adoptedOn: '2026-09-01',
  wakes: ['2026-09-20'],
  keepsakes: [{ kind: 'olive', on: '2026-10-02' }],
  updatedAt: 1,
}

describe('readPet', () => {
  it('returns a sound record as it is', () => {
    expect(readPet(pet)).toBe(pet)
  })

  it('reads missing or damaged lists as empty instead of throwing', () => {
    const damaged = {
      ...pet,
      wakes: undefined,
      keepsakes: 'olive',
    } as unknown as PetRecord
    expect(readPet(damaged)).toEqual({ ...pet, wakes: [], keepsakes: [] })
    expect(
      readPet({
        ...pet,
        keepsakes: [null, { kind: 'dragonfruit', on: '2026-10-03' }],
      } as unknown as PetRecord).keepsakes
    ).toEqual([])
  })
})

describe('readRoom', () => {
  const stored: PetRoomRecord = {
    id: 'room',
    ...DEFAULT_ROOM,
    floor: 'stone',
    hat: 'beret',
    updatedAt: 1,
  }

  it('reads the hat with the rest of the room', () => {
    expect(readRoom(stored, DEFAULT_ROOM)).toMatchObject({
      floor: 'stone',
      hat: 'beret',
    })
  })

  it('reads a room from before hats, or an unknown hat, as no hat', () => {
    const { hat: _hat, ...older } = stored
    expect(readRoom(older, DEFAULT_ROOM).hat).toBe('none')
    expect(
      readRoom({ ...stored, hat: 'crown' } as unknown as PetRoomRecord, {
        ...DEFAULT_ROOM,
      }).hat
    ).toBe('none')
  })
})
