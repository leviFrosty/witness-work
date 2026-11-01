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

export interface ActiveMotion {
  readonly table: MotionTable
  readonly startMs: number
}

export interface ScenePet {
  readonly species: PetSpeciesId
  readonly coat: string

  readonly mood: PetMood

  readonly seed: number

  readonly patUntilMs?: number

  readonly squishUntilMs?: number

  readonly motion?: ActiveMotion | null

  readonly wakeStartMs?: number | null
}

export interface SceneVisitor {
  readonly species: PetSpeciesId
  readonly coat: string

  readonly joyUntilMs?: number

  readonly outlined?: boolean
}

export interface SceneMoments {
  readonly rainbow?: boolean
  readonly paradise?: boolean
  readonly star?: boolean
  readonly gold?: boolean

  readonly gift?: GiftKind | null

  readonly sill?: readonly GiftKind[]
}

export interface SceneInput {
  readonly room: ResolvedRoom
  readonly sign: SignData

  readonly lampLevel: number
  readonly pet: ScenePet | null

  readonly visitors?: readonly SceneVisitor[]
  readonly moments?: SceneMoments
  readonly particles?: ParticleState | null

  readonly reduceMotion?: boolean
}

export interface PetFrame {
  readonly mood: PetMood
  readonly sprite: SpriteKey

  readonly pose: Pose

  readonly origin: readonly [number, number]

  readonly colorFromRow: number | null
}

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

function boundsOf(buf: PixelBuffer): Viewport | null {
  let bounds = spriteBounds.get(buf)
  if (bounds === undefined) {
    bounds = opaqueBounds(buf)
    spriteBounds.set(buf, bounds)
  }
  return bounds
}

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

  const shown = visitor.outlined ? outlinedSprite(sprite) : sprite
  const at = visitor.outlined ? 2 : 0
  blit(buf, shown, x - at, y - at)
  maskOpaque(subject, shown, x - at, y - at)
}

const OUTLINE = rgbPalette({ light: '#fffbe6', dark: '#3a2a20' })

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
      drawVisitor(buf, visitor, spot, 777 + i * 131, tMs, reduceMotion, subject)
    )
}

const subject = createMask(SCENE_W, SCENE_H)

const SPARKLE = rgbPalette({ core: '#fffbe6', ray: '#ffd34a' })
const SPARKLE_SHAPE: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [0, 1],
]

function drawGiftSparkle(buf: PixelBuffer, tMs: number): void {
  if (Math.floor(tMs / 400) % 3 !== 0) return
  const sx = 98 + Math.round(Math.sin(tMs / 300) * 4)
  const sy = 84 + Math.round(Math.cos(tMs / 300) * 2)
  SPARKLE_SHAPE.forEach(([a, b], i) =>
    setPixel(buf, sx + a, sy + b, i === 2 ? SPARKLE.core : SPARKLE.ray)
  )
}

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
