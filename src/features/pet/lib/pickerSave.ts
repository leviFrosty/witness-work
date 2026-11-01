import { cleanPetName } from '@/stores/pet'
import {
  defaultCoatFor,
  resolveCoat,
  type PetRecord,
  type PetSpecies,
} from '@/types/pet'

export type PetPickerMode = 'adopt' | 'change'

export type PetChoice = { species: PetSpecies; coat: string }

export type PetPickerSave =
  | { kind: 'adopt'; species: PetSpecies; coat: string; name?: string }
  | { kind: 'change'; species: PetSpecies; coat: string }
  | { kind: 'none' }

export function initialPetChoice(
  current: Pick<PetRecord, 'species' | 'coat'> | null,
  species?: PetSpecies
): PetChoice {
  if (species) return choiceForSpecies(species, current)
  if (current)
    return {
      species: current.species,
      coat: resolveCoat(current.species, current.coat),
    }
  return { species: 'lion', coat: defaultCoatFor('lion') }
}

export function choiceForSpecies(
  species: PetSpecies,
  current: Pick<PetRecord, 'species' | 'coat'> | null
): PetChoice {
  if (current?.species === species)
    return { species, coat: resolveCoat(species, current.coat) }
  return { species, coat: defaultCoatFor(species) }
}

export function petPickerSave(
  choice: PetChoice & { name?: string },
  current: Pick<PetRecord, 'species' | 'coat'> | null
): PetPickerSave {
  const coat = resolveCoat(choice.species, choice.coat)
  if (!current) {
    const name = cleanPetName(choice.name)
    return {
      kind: 'adopt',
      species: choice.species,
      coat,
      ...(name ? { name } : {}),
    }
  }
  if (
    current.species === choice.species &&
    resolveCoat(current.species, current.coat) === coat
  )
    return { kind: 'none' }
  return { kind: 'change', species: choice.species, coat }
}
