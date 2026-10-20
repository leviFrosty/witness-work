import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))

import {
  choiceForSpecies,
  initialPetChoice,
  petPickerSave,
} from '@/features/pet/lib/pickerSave'

const pip = { species: 'cat' as const, coat: 'tuxedo' }

describe('pet picker save', () => {
  it('starts on the pet as it is, or a lion cub', () => {
    expect(initialPetChoice(pip)).toEqual(pip)
    expect(initialPetChoice(null)).toEqual({ species: 'lion', coat: 'default' })
  })

  it("keeps the pet's coat for its own species, else the default", () => {
    expect(choiceForSpecies('cat', pip)).toEqual(pip)
    expect(choiceForSpecies('dog', pip)).toEqual({
      species: 'dog',
      coat: 'gold',
    })
    expect(choiceForSpecies('cat', null)).toEqual({
      species: 'cat',
      coat: 'orange',
    })
  })

  it('adopts with a cleaned name, or none', () => {
    expect(
      petPickerSave({ species: 'dog', coat: 'liver', name: '  Rex  ' }, null)
    ).toEqual({ kind: 'adopt', species: 'dog', coat: 'liver', name: 'Rex' })
    expect(
      petPickerSave({ species: 'lamb', coat: 'default', name: ' ' }, null)
    ).toEqual({ kind: 'adopt', species: 'lamb', coat: 'default' })
  })

  it('falls back to the default coat for a coat of another species', () => {
    expect(
      petPickerSave({ species: 'dog', coat: 'tuxedo' }, null)
    ).toMatchObject({ coat: 'gold' })
  })

  it('changes the look of an existing pet, never its name', () => {
    expect(
      petPickerSave({ species: 'dog', coat: 'black', name: 'Max' }, pip)
    ).toEqual({ kind: 'change', species: 'dog', coat: 'black' })
    expect(petPickerSave({ species: 'cat', coat: 'grey' }, pip)).toEqual({
      kind: 'change',
      species: 'cat',
      coat: 'grey',
    })
  })

  it('does nothing when the look is unchanged', () => {
    expect(petPickerSave(pip, pip)).toEqual({ kind: 'none' })
  })
})
