import { hashString } from '@/lib/pixelArt'
import type {
  GiftKind,
  PetKeepsake,
  PetMood,
  PetRecord,
  PetRoomSettings,
  PetVisit,
} from '@/types/pet'
import {
  resolveRoom,
  type PlayerInput,
  type SceneVisitor,
  type SignData,
} from '@/features/pet/art'
import { shouldShowRainbow } from '@/features/pet/lib/eggs'
import { moodOf, type PetLife } from '@/features/pet/lib/life'
import type { ResolvedWindow } from '@/features/pet/lib/liveWindow'
import type { PetDevOverride } from '@/features/pet/stores/petSession'

export type PetCardLife = {
  hearts: number
  dead: boolean
  asleep: boolean
  mood: PetMood
  gold: boolean
  goldStartedToday: boolean
  rainbowToday: boolean
}

export function cardLife(
  life: PetLife,
  override?: PetDevOverride | null
): PetCardLife {
  const base: PetCardLife = {
    hearts: life.hearts,
    dead: life.dead,
    asleep: life.asleep,
    mood: life.mood,
    gold: life.gold,
    goldStartedToday: life.goldStartedToday,
    rainbowToday: life.rainbowToday,
  }
  if (!override) return base
  let { hearts, dead } = base
  if (override.hearts !== undefined) {
    hearts = Math.max(0, Math.min(5, Math.round(override.hearts * 2) / 2))
    dead = hearts === 0
  }
  if (override.dead !== undefined) {
    dead = override.dead
    if (dead) hearts = 0
    else if (hearts === 0) hearts = 1
  }
  const gold = override.gold ?? (base.gold && hearts === 5)
  return {
    hearts,
    dead,
    asleep: !dead && hearts <= 0.5,
    mood: moodOf(hearts, dead),
    gold,
    goldStartedToday:
      override.goldStartedToday ?? (gold && base.goldStartedToday),
    rainbowToday: override.rainbow ?? base.rainbowToday,
  }
}

export const petSeed = (pet: Pick<PetRecord, 'id' | 'adoptedOn'>): number =>
  hashString(`${pet.id}:${pet.adoptedOn}`) % 100_000

export type PetVisitRoll = { paradise: boolean; star: boolean }

export type PetSceneArgs = {
  pet: PetRecord
  life: PetCardLife
  room: PetRoomSettings
  window: ResolvedWindow
  lampLevel: number
  sign: SignData
  pendingGift: { kind: GiftKind; on: string } | null
  keepsakes: readonly PetKeepsake[]

  visits: readonly PetVisit[]
  roll: PetVisitRoll
  override?: PetDevOverride | null
}

export type PetMomentsShown = {
  rainbow: boolean
  paradise: boolean
  star: boolean
  gold: boolean
  gift: GiftKind | null
  visitor: boolean
}

export const sillOf = (keepsakes: readonly PetKeepsake[]): GiftKind[] =>
  keepsakes.slice(-5).map((keepsake) => keepsake.kind)

export function petSceneInput(args: PetSceneArgs): {
  input: PlayerInput
  shown: PetMomentsShown
} {
  const o = args.override ?? {}
  const window = o.window ? { ...args.window, ...o.window } : args.window
  const gift = 'gift' in o ? (o.gift ?? null) : (args.pendingGift?.kind ?? null)
  const visitors: SceneVisitor[] = args.visits.map(({ pet }) => ({
    species: pet.species,
    coat: pet.coat,
  }))
  const shown: PetMomentsShown = {
    rainbow: shouldShowRainbow(args.life, window),
    paradise: o.paradise ?? args.roll.paradise,
    star: o.star ?? args.roll.star,
    gold: args.life.gold,
    gift,
    visitor: visitors.length > 0,
  }
  return {
    input: {
      room: { ...resolveRoom(args.room, window), ...o.window },
      sign: args.sign,
      lampLevel: o.lampLevel ?? args.lampLevel,
      pet: {
        species: args.pet.species,
        coat: args.pet.coat,
        mood: args.life.mood,
        seed: petSeed(args.pet),
      },
      visitors,
      moments: {
        rainbow: shown.rainbow,
        paradise: shown.paradise,
        star: shown.star,
        gold: shown.gold,
        gift,
        sill: o.sill ?? sillOf(args.keepsakes),
      },
    },
    shown,
  }
}

export function withShownHearts<Life extends PetCardLife | null>(
  life: Life,
  hearts: number
): Life {
  if (!life || life.dead || life.hearts === hearts) return life
  return { ...life, hearts, mood: moodOf(hearts, false) }
}
