/**
 * The shape of a species definition and the helper each species file uses.
 *
 * A species draws itself as a {@link ShapeSpec} in a 32 × 32 sprite (origin top
 * left; feet on rows 28–30, so the sprite stands on y = 31). `bob` moves the
 * head down by whole pixels and `tail` is the wag frame (0 or 1).
 */
import type { ShapeSpec } from '@/lib/pixelArt'
import { coatIdsFor, defaultCoatFor, type PetCoat } from '@/types/pet'

import { SPRITE_SIZE } from '../layout'
import type { PetFace, PetMoment, PetSpeciesId } from '../types'

/** Per-frame inputs to a species' rig. */
export interface SpritePose {
  readonly face: PetFace
  /** Head offset in pixels (idle bob plus motion bob). */
  readonly bob: number
  /** Tail frame, 0 or 1. */
  readonly tail: number
  readonly blink: boolean
  /**
   * The mouth is half shut on its way closed: the frame after an open mouth
   * (`joy`, `wide`) gives way to `face`. Species that don't open the mouth wide
   * ignore it.
   */
  readonly mouthClosing?: boolean
}

/** What every coat carries besides its palette. */
export interface CoatMeta {
  /** Colours for the picker swatch: one colour, or several for patterned coats. */
  readonly swatch: readonly string[]
}

/** A species as the rest of the app sees it. */
export interface SpeciesDefinition {
  readonly id: PetSpeciesId
  /** Coats by id; one-coat species have a single `default`. */
  readonly coats: Readonly<Record<string, CoatMeta>>
  /** Coat ids in picker order. */
  readonly coatIds: readonly string[]
  readonly defaultCoat: string
  /** I18n keys of the species' sounds (`pet.sound.<species>.<moment>`). */
  readonly soundKeys: Readonly<Record<PetMoment, string>>
  /** The rig for `pose` in coat `coatId` (unknown coats use the default). */
  build(pose: SpritePose, coatId: string): ShapeSpec
}

/**
 * What a species file provides: palette type `P` and one palette per coat of
 * `S`. Coat ids, their order and the default come from `@/types/pet`, so a
 * missing or unknown coat is a type error.
 */
export interface SpeciesSource<S extends PetSpeciesId, P> {
  readonly id: S
  readonly coats: Readonly<Record<PetCoat<S>, P & CoatMeta>>
  build(pose: SpritePose, coat: P): ShapeSpec
}

/** Builds a {@link SpeciesDefinition} from a species file's palette and rig. */
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

/** Polygon points, as `[x, y]` sprite pixels. */
export type Points = readonly (readonly [number, number])[]

/**
 * Left-side `pts` (an ear, a leg) placed on `side` of the sprite's centre line
 * (-1 keeps them on the left, 1 mirrors them to the right), moved down `dy`.
 */
export function sidePoints(pts: Points, side: -1 | 1, dy = 0): Points {
  const mid = SPRITE_SIZE / 2
  return pts.map(([x, y]) => [mid + side * (mid - x), y + dy] as const)
}
