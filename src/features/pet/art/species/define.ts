import type { ShapeSpec } from '@/lib/pixelArt'
import { coatIdsFor, defaultCoatFor, type PetCoat } from '@/types/pet'

import { SPRITE_SIZE } from '../layout'
import type { PetFace, PetMoment, PetSpeciesId } from '../types'

export interface SpritePose {
  readonly face: PetFace

  readonly bob: number

  readonly tail: number
  readonly blink: boolean

  readonly mouthClosing?: boolean
}

export interface CoatMeta {
  readonly swatch: readonly string[]
}

export interface SpeciesDefinition {
  readonly id: PetSpeciesId

  readonly coats: Readonly<Record<string, CoatMeta>>

  readonly coatIds: readonly string[]
  readonly defaultCoat: string

  readonly soundKeys: Readonly<Record<PetMoment, string>>

  build(pose: SpritePose, coatId: string): ShapeSpec
}

export interface SpeciesSource<S extends PetSpeciesId, P> {
  readonly id: S
  readonly coats: Readonly<Record<PetCoat<S>, P & CoatMeta>>
  build(pose: SpritePose, coat: P): ShapeSpec
}

export function defineSpecies<S extends PetSpeciesId, P>(
  src: SpeciesSource<S, P>
): SpeciesDefinition {
  const coats: Readonly<Record<string, P & CoatMeta>> = src.coats
  const coatIds: readonly string[] = coatIdsFor(src.id)
  const defaultCoat: string = defaultCoatFor(src.id)
  const soundKeys = {
    hi: `pet.sound.${src.id}.hi`,
    pat: `pet.sound.${src.id}.pat`,
    happy: `pet.sound.${src.id}.happy`,
    ok: `pet.sound.${src.id}.ok`,
    low: `pet.sound.${src.id}.low`,
    nap: `pet.sound.${src.id}.nap`,
  } satisfies Record<PetMoment, string>
  return {
    id: src.id,
    coats,
    coatIds,
    defaultCoat,
    soundKeys,
    build(pose, coatId) {
      const coat = coats[coatId] ?? coats[defaultCoat]
      return src.build(pose, coat)
    },
  }
}

export type Points = readonly (readonly [number, number])[]

export function sidePoints(pts: Points, side: -1 | 1, dy = 0): Points {
  const mid = SPRITE_SIZE / 2
  return pts.map(([x, y]) => [mid + side * (mid - x), y + dy] as const)
}
