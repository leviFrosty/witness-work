import i18n, { type TranslationKey } from '@/lib/locales'
import type { PetMood, PetSoundMoment, PetSpecies } from '@/types/pet'
import { SPECIES } from '@/features/pet/art'

/** The localized species name ("Lion cub", "Golden pup"). */
export const speciesName = (species: PetSpecies): string =>
  i18n.t(`pet.species.${species}` as TranslationKey)

/** The localized coat name ("Gold", "Tuxedo"); one-coat species have none. */
export const coatName = (species: PetSpecies, coat: string): string =>
  i18n.t(`pet.coat.${species}.${coat}` as TranslationKey)

/** The pet's name, or its localized species name when it has none. */
export const petDisplayName = (pet: {
  species: PetSpecies
  name?: string
}): string => pet.name || speciesName(pet.species)

/** The localized sound `species` makes for `moment` ("Woof!", "Zzz"). */
export const petSound = (species: PetSpecies, moment: PetSoundMoment): string =>
  i18n.t(SPECIES[species].soundKeys[moment] as TranslationKey)

/**
 * The sound a pet makes for how it feels, when Home opens: none for a pet that
 * died.
 */
export function moodMoment(mood: PetMood): PetSoundMoment | null {
  switch (mood) {
    case 'happy':
    case 'content':
      return 'happy'
    case 'ok':
      return 'ok'
    case 'low':
    case 'weak':
      return 'low'
    case 'nap':
      return 'nap'
    case 'dead':
      return null
  }
}
