/**
 * Vocabulary of the pet art: species ids, moods, faces and moments. The ids
 * themselves live once in `@/types/pet` (shared with the store and sync); this
 * module adds the art-only names.
 */
import {
  isPetSpecies,
  PET_SOUND_MOMENTS,
  PET_SPECIES_IDS,
  type PetMood as HeartsMood,
  type PetSoundMoment,
  type PetSpeciesId,
  type PetTransientMood,
} from '@/types/pet'

export { PET_SPECIES_IDS }
export type { PetSpeciesId }

/** Whether `value` is a known species id. */
export const isPetSpeciesId = isPetSpecies

/**
 * How the pet feels. The first seven come from hearts (`happy` … `nap`, and
 * `dead` when it died); `joy` (patted, celebrating) and `wide` (surprised) are
 * transient moods used by reactions and motion.
 */
export type PetMood = HeartsMood | PetTransientMood

/** Facial expression drawn on a sprite. */
export type PetFace = 'happy' | 'ok' | 'low' | 'nap' | 'dead' | 'joy' | 'wide'

/** Moments that have a sound (`pet.sound.<species>.<moment>`). */
export const PET_MOMENTS = PET_SOUND_MOMENTS

/** A moment with a localized pet sound. */
export type PetMoment = PetSoundMoment

/**
 * Grey treatment of a sprite: `none`, `weak` (a third of the way to grey) or
 * `full` (a pet that died).
 */
export type GreyMode = 'none' | 'weak' | 'full'
