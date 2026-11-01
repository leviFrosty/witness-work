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

export const SPECIES: Readonly<Record<PetSpeciesId, SpeciesDefinition>> = {
  lion,
  dog,
  cat,
  donkey,
  lamb,
}
