import { describe, expect, it } from 'vitest'
import { readPet } from '@/features/pet/lib/records'
import type { PetRecord } from '@/types/pet'

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
