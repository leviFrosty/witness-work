/**
 * Species registry. To add a species: add its id and coat ids in `@/types/pet`,
 * write `<id>.ts` with `defineSpecies`, register it here, and give it an
 * entrance and a trick in `motion/` (the type checker points at every place
 * that's missing). To add a coat: add its id in `@/types/pet` and one palette
 * entry to the species file.
 */
import { PET_SPECIES_IDS, type PetSpeciesId } from '../types'
import { cat } from './cat'
import type { SpeciesDefinition } from './define'
import { dog } from './dog'
import { donkey } from './donkey'
import { lamb } from './lamb'
import { lion } from './lion'

export type { CoatMeta, SpeciesDefinition, SpritePose } from './define'
export {
  coatIdsFor,
  defaultCoatFor,
  isValidCoat,
  resolveCoat,
} from '@/types/pet'
export { PET_SPECIES_IDS }
export type { PetSpeciesId }

/** Every species by id. */
export const SPECIES: Readonly<Record<PetSpeciesId, SpeciesDefinition>> = {
  lion,
  dog,
  cat,
  donkey,
  lamb,
}
