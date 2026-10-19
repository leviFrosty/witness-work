import { describe, expect, it } from 'vitest'
import { petSliceFromBackup } from '@/lib/petBackup'
import { DEFAULT_ROOM } from '@/types/pet'

const pet = {
  id: 'companion',
  species: 'dog',
  coat: 'gold',
  name: 'Rex',
  adoptedOn: '2026-09-01',
  wakes: ['2026-09-20'],
  keepsakes: [{ kind: 'olive', on: '2026-10-02' }],
  seed: 'k3x9q2',
  updatedAt: 100,
}
const room = { ...DEFAULT_ROOM, id: 'room', updatedAt: 100 }

describe('petSliceFromBackup', () => {
  it('restores a well-formed slice as it was', () => {
    expect(
      petSliceFromBackup({
        pet,
        room,
        deletedPetRecords: [{ id: 'x', deletedAt: 5 }],
      })
    ).toEqual({ pet, room, deletedPetRecords: [{ id: 'x', deletedAt: 5 }] })
  })

  it('fills in missing or damaged wake and keepsake lists', () => {
    const { wakes: _w, keepsakes: _k, ...bare } = pet
    expect(petSliceFromBackup({ pet: bare }).pet).toEqual({
      ...bare,
      wakes: [],
      keepsakes: [],
    })
    expect(
      petSliceFromBackup({
        pet: {
          ...pet,
          wakes: ['2026-09-20', 'soon', 4],
          keepsakes: [{ kind: 'fig', on: 'soon' }, null, pet.keepsakes[0]],
          seed: '',
        },
      }).pet
    ).toEqual({ ...pet, seed: undefined, wakes: ['2026-09-20'] })
  })

  it('leaves out what it can’t read, so the local value stays', () => {
    expect(petSliceFromBackup({ pet: { ...pet, species: 'dragon' } })).toEqual(
      {}
    )
    expect(petSliceFromBackup({ room: 'stone' })).toEqual({})
    expect(petSliceFromBackup('nope')).toEqual({})
    expect(
      petSliceFromBackup({
        deletedPetRecords: [{ id: 'x' }, { id: 'y', deletedAt: 1 }],
      })
    ).toEqual({ deletedPetRecords: [{ id: 'y', deletedAt: 1 }] })
  })

  it('restores no pet as no pet', () => {
    expect(petSliceFromBackup({ pet: null, room: null })).toEqual({
      pet: null,
      room: null,
    })
  })
})
