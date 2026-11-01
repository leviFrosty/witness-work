import i18n, { type TranslationKey } from '@/lib/locales'
import type { PetMood, PetSoundMoment, PetSpecies } from '@/types/pet'
import { SPECIES } from '@/features/pet/art'

export const speciesName = (species: PetSpecies): string =>
  i18n.t(`pet.species.${species}` as TranslationKey)

export const coatName = (species: PetSpecies, coat: string): string =>
  i18n.t(`pet.coat.${species}.${coat}` as TranslationKey)

export const petDisplayName = (pet: {
  species: PetSpecies
  name?: string
}): string => pet.name || speciesName(pet.species)

export const petSound = (species: PetSpecies, moment: PetSoundMoment): string =>
  i18n.t(SPECIES[species].soundKeys[moment] as TranslationKey)

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
