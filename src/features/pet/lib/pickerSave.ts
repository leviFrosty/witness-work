import { cleanPetName } from '@/stores/pet'
import {
  defaultCoatFor,
  resolveCoat,
  type PetRecord,
  type PetSpecies,
} from '@/types/pet'

/** How the picker opened: adopting a first pet, or Change Pet. */
export type PetPickerMode = 'adopt' | 'change'

/** What's picked in the picker. */
export type PetChoice = { species: PetSpecies; coat: string }

/** The store action the picker's primary button runs. */
export type PetPickerSave =
  | { kind: 'adopt'; species: PetSpecies; coat: string; name?: string }
  | { kind: 'change'; species: PetSpecies; coat: string }
  | { kind: 'none' }

/**
 * The picker's first choice: the animal it was opened with (`species`, from the
 * Home offer), else the pet as it is, or a lion cub.
 */
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

/** Picking a species: the pet's own coat when it's its species, else default. */
export function choiceForSpecies(
  species: PetSpecies,
  current: Pick<PetRecord, 'species' | 'coat'> | null
): PetChoice {
  if (current?.species === species)
    return { species, coat: resolveCoat(species, current.coat) }
  return { species, coat: defaultCoatFor(species) }
}

/**
 * What saving does. With no companion yet it adopts (whatever the mode); with
 * one it changes the appearance, or nothing when it's unchanged. The name only
 * applies to an adoption.
 */
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
