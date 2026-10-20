/**
 * Scene composer: one 180 × 100 frame of the room with its pet.
 *
 * Coordinates are scene pixels (origin top left; see `layout.ts`). The pet's 32
 * × 32 sprite rests with its top-left at (PET_X, PET_Y) = (52, 52); motion
 * offsets move it from there. Layers, back to front:
 *
 * 1. Room base (cached: wall, floor, window + rainbow, shelf, sign, sill, plant,
 *    stool, bed back layer, gift on the rug)
 * 2. Lamp (behind the pets: a pet running or hopping past it stays in front)
 * 3. Visitor pet (mirrored, at x 86), then the pet, then the bed front layer
 * 4. Lighting (cached per lamp × level × time × breathing phase); the pets' pixels
 *    darken less, so they stay the centre of the room at night
 * 5. Window moments (paradise walkers, shooting star), gift sparkle
 * 6. Particles (hearts, Zzz, sparkles) and dust
 *
 * `composeScene` is pure: all state (motions, pats, particles) comes in through
 * {@link SceneInput}. `player.ts` keeps that state for a live view.
 */
import {
  blit,
  copyInto,
  createBuffer,
  createMask,
  maskOpaque,
  rgbPalette,
  setPixel,
  type PixelBuffer,
  type PixelMask,
} from '@/lib/pixelArt'

import {
  evaluateMotion,
  REST_POSE,
  WAKE,
  type MotionTable,
  type Pose,
} from '../motion'
import { applyLighting } from './lighting'
import { PET_X, PET_Y, SCENE_H, SCENE_W, VISITOR_X } from './layout'
import { draw as drawParticles, type ParticleState } from './particles'
import {
  bedFrontLayer,
  drawRoomBase,
  LAMPS,
  lampSprite,
  type GiftKind,
  type ResolvedRoom,
  type SignData,
} from './room'
import { greyModeFor, idlePose, petSprite, type SpriteKey } from './sprite'
import type { GreyMode, PetMood, PetSpeciesId } from './types'
import { drawParadiseWalkers, drawShootingStar } from './windowExtras'

/** A motion in progress. */
export interface ActiveMotion {
  readonly table: MotionTable
  readonly startMs: number
}

/** The companion as the scene needs it. */
export interface ScenePet {
  readonly species: PetSpeciesId
  readonly coat: string
  /** Mood from hearts (`happy` … `nap`, `dead`). */
  readonly mood: PetMood
  /** Per-pet offset for the blink clock. */
  readonly seed: number
  /** Joyful until then (a pat or rub). */
  readonly patUntilMs?: number
  /** Head pressed down until then (a tap). */
  readonly squishUntilMs?: number
  /** An entrance or trick in progress. */
  readonly motion?: ActiveMotion | null
  /** When the wake animation started, while it plays. */
  readonly wakeStartMs?: number | null
}

/** A buddy's pet sitting beside the companion. */
export interface SceneVisitor {
  readonly species: PetSpeciesId
  readonly coat: string
  /** Joyful until then. */
  readonly joyUntilMs?: number
}

/** Hidden moments showing this frame. */
export interface SceneMoments {
  readonly rainbow?: boolean
  readonly paradise?: boolean
  readonly star?: boolean
  readonly gold?: boolean
  /** A gift waiting on the rug. */
  readonly gift?: GiftKind | null
  /** Keepsakes on the window sill, left to right (up to 5). */
  readonly sill?: readonly GiftKind[]
}

/** Everything one frame depends on. */
export interface SceneInput {
  readonly room: ResolvedRoom
  readonly sign: SignData
  /** Lamp level 0–5 (the Service Streak). */
  readonly lampLevel: number
  readonly pet: ScenePet | null
  readonly visitor?: SceneVisitor | null
  readonly moments?: SceneMoments
  readonly particles?: ParticleState | null
  /** Reduce Motion: no idle bob, no motion offsets, particles stay put. */
  readonly reduceMotion?: boolean
}

/** The pet's resolved look and place for one frame. */
export interface PetFrame {
  /** Mood shown this frame (motion and pats applied). */
  readonly mood: PetMood
  readonly sprite: SpriteKey
  /** Motion pose (at rest when no motion plays). */
  readonly pose: Pose
  /** Sprite top-left in the scene. */
  readonly origin: readonly [number, number]
  /** Wake sweep: the first sprite row in colour, or null. */
  readonly colorFromRow: number | null
}

/** Resolves the pet's mood, pose and sprite at `tMs`. */
export function petFrame(
  pet: ScenePet,
  tMs: number,
  reduceMotion = false
): PetFrame {
  let pose: Pose = REST_POSE
  let mood = pet.mood
  let colorFromRow: number | null = null
  let wakeGrey: GreyMode | null = null
  let moving = false
  if (pet.motion) {
    pose = evaluateMotion(pet.motion.table, tMs - pet.motion.startMs).pose
    mood = pose.mood
    moving = true
  }
  if (pet.wakeStartMs !== undefined && pet.wakeStartMs !== null) {
    const u = tMs - pet.wakeStartMs
    pose = evaluateMotion(WAKE, u).pose
    mood = pose.mood
    colorFromRow = WAKE.colorFromRow(u)
    // The colour comes back as the pet will look awake (one heart: faded), so
    // nothing changes when the wake ends. Its mood may not have caught up yet.
    wakeGrey = greyModeFor(pet.mood === 'dead' ? 'weak' : pet.mood)
    moving = true
  }
  if (!moving && pet.patUntilMs !== undefined && tMs < pet.patUntilMs)
    mood = 'joy'
  if (reduceMotion) pose = { ...REST_POSE, mood: pose.mood }

  const squish = pet.squishUntilMs !== undefined && tMs < pet.squishUntilMs
  const idle = idlePose(mood, reduceMotion ? 0 : tMs, pet.seed, { squish })
  const sprite: SpriteKey = {
    face: idle.face,
    bob: idle.bob + pose.bobAdd,
    tail: idle.tail,
    blink: reduceMotion ? false : idle.blink,
    flip: pose.flip,
    lie: idle.lie || pose.lie,
    grey: wakeGrey ?? greyModeFor(mood),
  }
  return {
    mood,
    sprite,
    pose,
    origin: [Math.round(PET_X + pose.dx), Math.round(PET_Y + pose.dy)],
    colorFromRow,
  }
}

function drawPet(
  buf: PixelBuffer,
  pet: ScenePet,
  frame: PetFrame,
  subject: PixelMask
): void {
  const [ox, oy] = frame.origin
  const color = petSprite(pet.species, pet.coat, frame.sprite)
  maskOpaque(subject, color, ox, oy)
  const cut = frame.colorFromRow
  if (cut === null) {
    blit(buf, color, ox, oy)
    return
  }
  const grey = petSprite(pet.species, pet.coat, {
    ...frame.sprite,
    grey: 'full',
  })
  blit(buf, grey, ox, oy, (c, _x, y) => (y < cut ? c : null))
  blit(buf, color, ox, oy, (c, _x, y) => (y >= cut ? c : null))
}

function drawVisitor(
  buf: PixelBuffer,
  visitor: SceneVisitor,
  tMs: number,
  reduceMotion: boolean,
  subject: PixelMask
): void {
  const joy = visitor.joyUntilMs !== undefined && tMs < visitor.joyUntilMs
  const idle = idlePose(joy ? 'joy' : 'happy', reduceMotion ? 0 : tMs, 777)
  const sprite = petSprite(visitor.species, visitor.coat, {
    ...idle,
    blink: reduceMotion ? false : idle.blink,
    flip: true,
    lie: false,
  })
  blit(buf, sprite, VISITOR_X, PET_Y)
  maskOpaque(subject, sprite, VISITOR_X, PET_Y)
}

/** Which pixels are the pets', for the lighting (reused frame to frame). */
const subject = createMask(SCENE_W, SCENE_H)

const SPARKLE = rgbPalette({ core: '#fffbe6', ray: '#ffd34a' })
const SPARKLE_SHAPE: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [0, 1],
]

/** A twinkle circling the gift on the rug, on for 0.4 s of every 1.2 s. */
function drawGiftSparkle(buf: PixelBuffer, tMs: number): void {
  if (Math.floor(tMs / 400) % 3 !== 0) return
  const sx = 98 + Math.round(Math.sin(tMs / 300) * 4)
  const sy = 84 + Math.round(Math.cos(tMs / 300) * 2)
  SPARKLE_SHAPE.forEach(([a, b], i) =>
    setPixel(buf, sx + a, sy + b, i === 2 ? SPARKLE.core : SPARKLE.ray)
  )
}

/**
 * Composes the frame at `tMs` into `out` (or a new buffer) and returns it:
 * always 180 × 100, every pixel opaque. `frame` is the pet's {@link petFrame}
 * for this same input and time, when the caller already has it (the player
 * needs the mood first), so it isn't resolved twice.
 */
export function composeScene(
  input: SceneInput,
  tMs: number,
  out: PixelBuffer = createBuffer(SCENE_W, SCENE_H),
  frame?: PetFrame | null
): PixelBuffer {
  const { room, moments = {}, reduceMotion = false } = input
  const level = Math.max(0, Math.min(5, Math.round(input.lampLevel)))
  copyInto(
    out,
    drawRoomBase(room, input.sign, {
      rainbow: moments.rainbow,
      sill: moments.sill,
      gift: moments.gift,
    })
  )

  const lamp = LAMPS[room.lamp]
  blit(out, lampSprite(room.lamp, level, tMs), lamp.ox, lamp.oy)

  subject.data.fill(0)
  if (input.visitor) drawVisitor(out, input.visitor, tMs, reduceMotion, subject)
  let origin: readonly [number, number] = [PET_X, PET_Y]
  if (input.pet) {
    const pet = frame ?? petFrame(input.pet, tMs, reduceMotion)
    drawPet(out, input.pet, pet, subject)
    origin = pet.origin
  }

  const bedFront = bedFrontLayer(room.bed)
  if (bedFront) {
    blit(out, bedFront, 0, 0)
    maskOpaque(subject, bedFront, 0, 0, false)
  }
  applyLighting(out, room.lamp, level, room.time, tMs, subject)

  if (moments.paradise) drawParadiseWalkers(out, tMs)
  if (moments.star) drawShootingStar(out, tMs)
  if (moments.gift) drawGiftSparkle(out, tMs)
  if (input.particles) {
    drawParticles(out, input.particles, tMs, origin, { frozen: reduceMotion })
  }
  return out
}
