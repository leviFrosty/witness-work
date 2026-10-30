/**
 * Scene composer: one 180 × 100 frame of the room with its pet.
 *
 * Coordinates are scene pixels (origin top left; see `layout.ts`). The pet's 32
 * × 32 sprite rests with its top-left at (PET_X, PET_Y) = (52, 52); motion
 * offsets move it from there. Layers, back to front:
 *
 * 1. Room base (cached: wall, floor, window + rainbow, shelf, sign, sill, plant,
 *    stool, bed back layer, gift on the rug)
 * 2. Visiting pets (mirrored, at `VISITOR_SPOTS`, all behind the pet)
 * 3. Lamp and its stool (in front of the visitors, behind the pet: a pet running
 *    or hopping past it stays in front), the pet in its hat, then the bed front
 *    layer
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
  isOpaque,
  maskOpaque,
  opaqueBounds,
  rgbPalette,
  setPixel,
  type PixelBuffer,
  type PixelMask,
  type Viewport,
} from '@/lib/pixelArt'

import {
  evaluateMotion,
  REST_POSE,
  WAKE,
  type MotionTable,
  type Pose,
} from '../motion'
import { HAT_ANCHOR_Y, HAT_EARS_THROUGH, hatOrigin, hatSprite } from './hats'
import { applyLighting } from './lighting'
import { PET_X, PET_Y, SCENE_H, SCENE_W, VISITOR_SPOTS } from './layout'
import { draw as drawParticles, type ParticleState } from './particles'
import {
  bedFrontLayer,
  drawRoomBase,
  LAMPS,
  lampSprite,
  stoolLayer,
  type GiftKind,
  type ResolvedRoom,
  type SignData,
} from './room'
import {
  greyModeFor,
  idlePose,
  MOUTH_CLOSING_MS,
  petSprite,
  type SpriteKey,
} from './sprite'
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
  /** Outlined, in front of the other visitors: the one being long-pressed. */
  readonly outlined?: boolean
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
  /** Lamp level 0–5 (the hearts, `lib/lamp.ts`). */
  readonly lampLevel: number
  readonly pet: ScenePet | null
  /** Buddies' pets visiting, in `VISITOR_SPOTS` order. */
  readonly visitors?: readonly SceneVisitor[]
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

/**
 * The pet's hat for this frame and where it goes, or null with no hat (or lying
 * down). While the wake's colour hasn't reached the head, it stays grey.
 */
function petHat(
  pet: Pick<ScenePet, 'species'>,
  frame: PetFrame,
  hat: string
): { sprite: PixelBuffer; at: [number, number] } | null {
  if (hat === 'none' || frame.sprite.lie) return null
  const bob = frame.sprite.bob
  const cut = frame.colorFromRow
  const grey =
    cut !== null && cut > HAT_ANCHOR_Y[pet.species] + bob
      ? 'full'
      : (frame.sprite.grey ?? 'none')
  const sprite = hatSprite(hat, { flip: frame.sprite.flip, grey })
  if (!sprite) return null
  return { sprite, at: hatOrigin(pet.species, frame.origin, bob) }
}

const spriteBounds = new WeakMap<PixelBuffer, Viewport | null>()

/** `buf`'s opaque bounds, worked out once per (memoized) sprite. */
function boundsOf(buf: PixelBuffer): Viewport | null {
  let bounds = spriteBounds.get(buf)
  if (bounds === undefined) {
    bounds = opaqueBounds(buf)
    spriteBounds.set(buf, bounds)
  }
  return bounds
}

/**
 * The scene pixels the pet covers this frame, hat included: the box around its
 * drawn pixels, for telling a touch on the pet from one on the room.
 */
export function petBox(
  pet: Pick<ScenePet, 'species' | 'coat'>,
  frame: PetFrame,
  hat = 'none'
): Viewport | null {
  const boxes: Viewport[] = []
  const body = boundsOf(petSprite(pet.species, pet.coat, frame.sprite))
  if (body)
    boxes.push([
      body[0] + frame.origin[0],
      body[1] + frame.origin[1],
      body[2],
      body[3],
    ])
  const worn = petHat(pet, frame, hat)
  const top = worn && boundsOf(worn.sprite)
  if (worn && top)
    boxes.push([top[0] + worn.at[0], top[1] + worn.at[1], top[2], top[3]])
  if (boxes.length === 0) return null
  const x0 = Math.min(...boxes.map((b) => b[0]))
  const y0 = Math.min(...boxes.map((b) => b[1]))
  const x1 = Math.max(...boxes.map((b) => b[0] + b[2]))
  const y1 = Math.max(...boxes.map((b) => b[1] + b[3]))
  return [x0, y0, x1 - x0, y1 - y0]
}

function drawPet(
  buf: PixelBuffer,
  pet: ScenePet,
  frame: PetFrame,
  subject: PixelMask,
  hat: string
): void {
  drawPetBody(buf, pet, frame, subject)
  const worn = petHat(pet, frame, hat)
  if (!worn) return
  blit(buf, worn.sprite, worn.at[0], worn.at[1])
  maskOpaque(subject, worn.sprite, worn.at[0], worn.at[1])
  const ears = HAT_EARS_THROUGH[pet.species]
  if (!ears) return
  // The ears again, over the hat, down to just above the brim.
  const lastRow = HAT_ANCHOR_Y[pet.species] + frame.sprite.bob - 2
  const cut = frame.colorFromRow
  const sprite = petSprite(pet.species, pet.coat, {
    ...frame.sprite,
    ...(cut !== null && cut > lastRow ? { grey: 'full' as const } : {}),
  })
  blit(buf, sprite, frame.origin[0], frame.origin[1], (c, x, y) =>
    y <= lastRow && (x <= ears[0] || x >= ears[1]) ? c : null
  )
}

function drawPetBody(
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
  [x, y]: readonly [number, number],
  seed: number,
  tMs: number,
  reduceMotion: boolean,
  subject: PixelMask
): void {
  const until = visitor.joyUntilMs
  const joy = until !== undefined && tMs < until
  const idle = idlePose(joy ? 'joy' : 'happy', reduceMotion ? 0 : tMs, seed)
  const sprite = petSprite(visitor.species, visitor.coat, {
    ...idle,
    blink: reduceMotion ? false : idle.blink,
    mouthClosing: until !== undefined && !joy && tMs < until + MOUTH_CLOSING_MS,
    flip: true,
    lie: false,
  })
  // The one being long-pressed, in its outline.
  const shown = visitor.outlined ? outlinedSprite(sprite) : sprite
  const at = visitor.outlined ? 2 : 0
  blit(buf, shown, x - at, y - at)
  maskOpaque(subject, shown, x - at, y - at)
}

const OUTLINE = rgbPalette({ light: '#fffbe6', dark: '#3a2a20' })

/**
 * `sprite` in a sticker outline, one pixel larger on every side: a light line
 * around its shape, then a dark one around that.
 */
function outlinedSprite(sprite: PixelBuffer): PixelBuffer {
  const out = createBuffer(sprite.width + 4, sprite.height + 4)
  const inside = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < sprite.width &&
    y < sprite.height &&
    isOpaque(sprite, x, y)
  const ring =
    (filled: (x: number, y: number) => boolean) => (x: number, y: number) =>
      !filled(x, y) &&
      (filled(x - 1, y) ||
        filled(x + 1, y) ||
        filled(x, y - 1) ||
        filled(x, y + 1))
  const light = ring(inside)
  const dark = ring((x, y) => inside(x, y) || light(x, y))
  for (let y = -2; y < sprite.height + 2; y++) {
    for (let x = -2; x < sprite.width + 2; x++) {
      if (light(x, y)) setPixel(out, x + 2, y + 2, OUTLINE.light)
      else if (dark(x, y)) setPixel(out, x + 2, y + 2, OUTLINE.dark)
    }
  }
  blit(out, sprite, 2, 2)
  return out
}

/**
 * Draws the visitors, the furthest back first and the outlined one in front of
 * the rest; all sit behind the pet.
 */
function drawVisitors(
  buf: PixelBuffer,
  visitors: readonly SceneVisitor[],
  tMs: number,
  reduceMotion: boolean,
  subject: PixelMask
): void {
  visitors
    .slice(0, VISITOR_SPOTS.length)
    .map((visitor, i) => ({ visitor, i, spot: VISITOR_SPOTS[i] }))
    .sort(
      (a, b) =>
        Number(!!a.visitor.outlined) - Number(!!b.visitor.outlined) ||
        a.spot[1] - b.spot[1]
    )
    .forEach(({ visitor, i, spot }) =>
      // Their own idle timing, so they don't bob in step.
      drawVisitor(buf, visitor, spot, 777 + i * 131, tMs, reduceMotion, subject)
    )
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

  subject.data.fill(0)
  drawVisitors(out, input.visitors ?? [], tMs, reduceMotion, subject)

  // Over the visitors, so the User's lamp (and its stool) always shows; lit as
  // the room.
  const lamp = LAMPS[room.lamp]
  if (lamp.stool && input.visitors?.length) {
    const stool = stoolLayer()
    blit(out, stool, 0, 0)
    maskOpaque(subject, stool, 0, 0, false)
  }
  const lampImage = lampSprite(room.lamp, level, tMs)
  blit(out, lampImage, lamp.ox, lamp.oy)
  maskOpaque(subject, lampImage, lamp.ox, lamp.oy, false)
  let origin: readonly [number, number] = [PET_X, PET_Y]
  if (input.pet) {
    const pet = frame ?? petFrame(input.pet, tMs, reduceMotion)
    drawPet(out, input.pet, pet, subject, room.hat ?? 'none')
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
