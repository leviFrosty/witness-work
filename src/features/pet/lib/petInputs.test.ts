import { describe, expect, it } from 'vitest'
import { petGiftSeed } from '@/features/pet/lib/gifts'
import { simulateLife } from '@/features/pet/lib/life'
import {
  petLifeInput,
  petLifeOn,
  selectPetActiveDays,
} from '@/features/pet/lib/petInputs'
import type { PetRecord } from '@/types/pet'

const records = () => ({
  serviceReports: {},
  visits: [{ date: new Date(2026, 9, 2, 10) }],
  dayPlans: [{ savedOn: '2026-10-03' }],
  recurringPlans: [],
})

const pet: PetRecord = {
  id: 'companion',
  species: 'lamb',
  coat: 'default',
  adoptedOn: '2026-10-01',
  wakes: [],
  keepsakes: [],
  seed: 'k3x9q2',
  updatedAt: 1,
}

describe('selectPetActiveDays', () => {
  it('is one set for Home and the widget while the records are the same', () => {
    const lists = records()
    const days = selectPetActiveDays(lists)
    expect([...days].sort()).toEqual(['2026-10-02', '2026-10-03'])
    expect(selectPetActiveDays({ ...lists })).toBe(days)
    expect(selectPetActiveDays({ ...lists, dayPlans: [] })).not.toBe(days)
  })
})

describe('petLifeOn', () => {
  it('replays with the pet’s own gift seed', () => {
    const days = selectPetActiveDays(records())
    expect(petLifeInput(pet, days, '2026-10-05').giftSeed).toBe(
      petGiftSeed(pet)
    )
    expect(petLifeOn(pet, days, '2026-10-05')).toBe(
      simulateLife(petLifeInput(pet, days, '2026-10-05'))
    )
  })
})
