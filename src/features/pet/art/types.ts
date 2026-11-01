import {
  PET_SOUND_MOMENTS,
  PET_SPECIES_IDS,
  type PetMood as HeartsMood,
  type PetSoundMoment,
  type PetSpeciesId,
  type PetTransientMood,
} from '@/types/pet'

export { PET_SPECIES_IDS }
export type { PetSpeciesId }

export type PetMood = HeartsMood | PetTransientMood

export type PetFace = 'happy' | 'ok' | 'low' | 'nap' | 'dead' | 'joy' | 'wide'

export const PET_MOMENTS = PET_SOUND_MOMENTS

export type PetMoment = PetSoundMoment

export type GreyMode = 'none' | 'weak' | 'full'
