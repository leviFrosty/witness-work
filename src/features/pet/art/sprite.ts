/**
 * Pet sprites: the idle pose clock and the memoized 32 × 32 sprite raster.
 *
 * Sprites are drawn in their own 32 × 32 space (origin top left, feet on rows
 * 28–30). The scene places them with their top-left at (PET_X, PET_Y) = (52,
 * 52) plus any motion offset.
 */
import {
  createLru,
  flipH,
  greyOf,
  lieDown,
  mapColors,
  rasterize,
  type PixelBuffer,
} from '@/lib/pixelArt'

import { SPRITE_SIZE } from './layout'
import { resolveCoat, SPECIES } from './species'
import type { SpritePose } from './species'
import type { GreyMode, PetFace, PetMood, PetSpeciesId } from './types'

/** The face each mood shows (content looks happy, weak looks low). */
const FACE_OF: Readonly<Record<PetMood, PetFace>> = {
  happy: 'happy',
  content: 'happy',
  ok: 'ok',
  low: 'low',
  weak: 'low',
  nap: 'nap',
  dead: 'dead',
  joy: 'joy',
  wide: 'wide',
}

/** The face a mood shows. */
export function faceOf(mood: PetMood): PetFace {
  return FACE_OF[mood]
}

/** Whether `face` has the mouth open (the tongue out). */
export function mouthOpen(face: PetFace): boolean {
  return face === 'joy' || face === 'wide'
}

/**
 * How long the mouth shows half shut after an open mouth ends: one frame of the
 * 10 fps clock, so it eases closed instead of snapping.
 */
export const MOUTH_CLOSING_MS = 100

/** Idle bob period (ms per frame) by mood; others use 560. */
const BOB_MS: Partial<Record<PetMood, number>> = {
  nap: 1400,
  joy: 260,
  low: 900,
  weak: 1300,
}

const DROOPY: readonly PetMood[] = ['low', 'weak', 'nap']
const STILL_TAIL: readonly PetMood[] = ['nap', 'low', 'weak', 'dead']
const BLINKS: readonly PetMood[] = ['happy', 'content', 'ok', 'low', 'weak']

/** One frame of the idle animation. */
export interface IdlePose extends SpritePose {
  readonly mood: PetMood
  /** Lying down (a pet that died). */
  readonly lie: boolean
}

/**
 * The idle pose at `tMs` for `mood`: the head bobs on a mood-dependent beat
 * (droopy moods sit a pixel lower), the tail wags unless sleepy or sad, and the
 * eyes blink for 150 ms every 3.4 s, offset by `seed` so two pets don't blink
 * together. `tMs` 0 is a still frame (widgets, thumbnails, Reduce Motion,
 * paused tiles), so it never blinks. A pet that died lies still. `squish` (a
 * head pat) presses the head down one pixel.
 */
export function idlePose(
  mood: PetMood,
  tMs: number,
  seed: number,
  opts: { readonly squish?: boolean } = {}
): IdlePose {
  const period = mood === 'dead' ? 1e12 : (BOB_MS[mood] ?? 560)
  const bob =
    mood === 'dead'
      ? 0
      : (Math.floor(tMs / period) % 2) +
        (DROOPY.includes(mood) ? 1 : 0) +
        (opts.squish ? 1 : 0)
  const tail = STILL_TAIL.includes(mood)
    ? 0
    : Math.floor(tMs / (mood === 'joy' ? 180 : 380)) % 2
  const blink = tMs > 0 && BLINKS.includes(mood) && (tMs + seed) % 3400 < 150
  return { mood, face: faceOf(mood), bob, tail, blink, lie: mood === 'dead' }
}

/** Everything that changes a sprite's pixels. */
export interface SpriteKey extends SpritePose {
  readonly flip?: boolean
  readonly lie?: boolean
  readonly grey?: GreyMode
}

/** Grey strength per mode. */
const GREY_T: Record<Exclude<GreyMode, 'none'>, number> = {
  weak: 0.35,
  full: 0.88,
}

/** `px` greyed as `grey` asks (itself for `none`). */
export function greyed(px: PixelBuffer, grey: GreyMode): PixelBuffer {
  if (grey === 'none') return px
  const t = GREY_T[grey]
  return mapColors(px, (c) => greyOf(c, t))
}

/** Grey mode for a mood: full for a pet that died, partial when weak. */
export function greyModeFor(mood: PetMood): GreyMode {
  return mood === 'dead' ? 'full' : mood === 'weak' ? 'weak' : 'none'
}

const cache = createLru<PixelBuffer>(256)

/** The cache key of a sprite. */
export function spriteKey(
  species: PetSpeciesId,
  coat: string,
  pose: SpriteKey
): string {
  return [
    species,
    coat,
    pose.face,
    pose.bob,
    pose.tail,
    pose.blink ? 1 : 0,
    pose.mouthClosing ? 1 : 0,
    pose.flip ? 1 : 0,
    pose.lie ? 1 : 0,
    pose.grey ?? 'none',
  ].join('|')
}

/**
 * The 32 × 32 sprite of `species` in `coat` for `pose`: rasterized, then laid
 * down, mirrored and greyed as asked. Memoized (bounded LRU), so callers must
 * not mutate the result. Unknown coats fall back to the species' default.
 */
export function petSprite(
  species: PetSpeciesId,
  coat: string,
  pose: SpriteKey
): PixelBuffer {
  const coatId = resolveCoat(species, coat)
  const key = spriteKey(species, coatId, pose)
  return cache.getOrCreate(key, () => {
    let px = rasterize(
      SPECIES[species].build(pose, coatId),
      SPRITE_SIZE,
      SPRITE_SIZE
    )
    if (pose.lie) px = lieDown(px)
    if (pose.flip) px = flipH(px)
    return greyed(px, pose.grey ?? 'none')
  })
}
