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

export function faceOf(mood: PetMood): PetFace {
  return FACE_OF[mood]
}

export function mouthOpen(face: PetFace): boolean {
  return face === 'joy' || face === 'wide'
}

export const MOUTH_CLOSING_MS = 100

const BOB_MS: Partial<Record<PetMood, number>> = {
  nap: 1400,
  joy: 260,
  low: 900,
  weak: 1300,
}

const DROOPY: readonly PetMood[] = ['low', 'weak', 'nap']
const STILL_TAIL: readonly PetMood[] = ['nap', 'low', 'weak', 'dead']
const BLINKS: readonly PetMood[] = ['happy', 'content', 'ok', 'low', 'weak']

export interface IdlePose extends SpritePose {
  readonly mood: PetMood

  readonly lie: boolean
}

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

export interface SpriteKey extends SpritePose {
  readonly flip?: boolean
  readonly lie?: boolean
  readonly grey?: GreyMode
}

const GREY_T: Record<Exclude<GreyMode, 'none'>, number> = {
  weak: 0.35,
  full: 0.88,
}

export function greyed(px: PixelBuffer, grey: GreyMode): PixelBuffer {
  if (grey === 'none') return px
  const t = GREY_T[grey]
  return mapColors(px, (c) => greyOf(c, t))
}

export function greyModeFor(mood: PetMood): GreyMode {
  return mood === 'dead' ? 'full' : mood === 'weak' ? 'weak' : 'none'
}

const cache = createLru<PixelBuffer>(256)

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
