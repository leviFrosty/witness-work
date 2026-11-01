import type { PixelBuffer, Viewport } from '@/lib/pixelArt'

import {
  ENTRANCES,
  evaluateMotion,
  TRICKS,
  TWIRL,
  WAKE,
  type MotionTable,
} from '../motion'
import {
  clearDust,
  clearParticles,
  createParticles,
  emitDust,
  emitHeartBurst,
  emitPatHeart,
  step,
  type ParticleState,
} from './particles'
import {
  composeScene,
  petBox,
  petFrame,
  type ActiveMotion,
  type SceneInput,
  type ScenePet,
} from './scene'
import { MOUTH_CLOSING_MS, mouthOpen } from './sprite'
import type { PetMoment, PetMood, PetSpeciesId } from './types'

export type MotionKind = 'entrance' | 'trick' | 'twirl' | 'wake'

export interface PlayerPet {
  readonly species: PetSpeciesId
  readonly coat: string
  readonly mood: PetMood
  readonly seed: number
}

export type PlayerInput = Omit<
  SceneInput,
  'pet' | 'particles' | 'reduceMotion'
> & {
  readonly pet: PlayerPet | null
}

export interface PlayerFrame {
  readonly buffer: PixelBuffer

  readonly say: PetMoment | null

  readonly ended: MotionKind | null

  readonly petBox: Viewport | null

  readonly hearts: boolean
}

export type PatResult = 'pat' | 'wake' | 'busy'

const PAT_JOY_MS = 1500
const SQUISH_MS = 160

export interface ScenePlayer {
  playEntrance(species: PetSpeciesId, tMs: number): void

  playTrick(species: PetSpeciesId, tMs: number): void

  playTwirl(tMs: number): void

  playWake(tMs: number): void

  cheer(tMs: number): void

  pat(tMs: number, mood: PetMood, opts?: { readonly rub?: boolean }): PatResult

  isBusy(): boolean

  setReduceMotion(on: boolean): void

  frame(input: PlayerInput, tMs: number, out?: PixelBuffer): PlayerFrame

  reset(): void
}

interface Playing {
  readonly kind: MotionKind
  readonly table: MotionTable
  readonly startMs: number
  said: boolean
}

export function createScenePlayer(
  opts: { seed?: number; reduceMotion?: boolean } = {}
): ScenePlayer {
  let particles: ParticleState = createParticles(opts.seed ?? 1)
  let playing: Playing | null = null
  let patUntilMs = 0
  let squishUntilMs = 0
  let pendingSay: PetMoment | null = null
  let reduceMotion = opts.reduceMotion ?? false

  let mouthWasOpen = false
  let mouthClosedAtMs = -Infinity

  const start = (kind: MotionKind, table: MotionTable, tMs: number) => {
    playing = { kind, table, startMs: tMs, said: false }
    particles =
      kind === 'entrance' ? clearParticles(particles) : clearDust(particles)
  }

  return {
    playEntrance(species, tMs) {
      if (reduceMotion) {
        pendingSay = ENTRANCES[species].sayMoment
        return
      }
      start('entrance', ENTRANCES[species], tMs)
    },
    playTrick(species, tMs) {
      if (reduceMotion) {
        pendingSay = TRICKS[species].sayMoment
        return
      }
      start('trick', TRICKS[species], tMs)
    },
    playTwirl(tMs) {
      if (reduceMotion) {
        particles = emitHeartBurst(particles, tMs)
        pendingSay = TWIRL.sayMoment
        return
      }
      start('twirl', TWIRL, tMs)
    },
    playWake(tMs) {
      playing = { kind: 'wake', table: WAKE, startMs: tMs, said: false }
    },
    cheer(tMs) {
      if (playing) return
      patUntilMs = tMs + PAT_JOY_MS
      particles = emitHeartBurst(particles, tMs)
      pendingSay = 'happy'
    },
    pat(tMs, mood, o = {}) {
      if (playing) return 'busy'
      if (mood === 'dead' || mood === 'nap') return 'wake'
      patUntilMs = tMs + PAT_JOY_MS
      if (!o.rub) squishUntilMs = tMs + SQUISH_MS
      particles = emitPatHeart(particles, tMs)
      pendingSay = 'pat'
      return 'pat'
    },
    isBusy() {
      return playing !== null
    },
    setReduceMotion(on) {
      reduceMotion = on
    },
    frame(input, tMs, out) {
      let say = pendingSay
      pendingSay = null
      let ended: MotionKind | null = null
      const current = playing
      let pet: ScenePet | null = null
      if (input.pet) {
        const motion: ActiveMotion | null =
          current && current.kind !== 'wake'
            ? { table: current.table, startMs: current.startMs }
            : null
        pet = {
          ...input.pet,
          patUntilMs,
          squishUntilMs,
          motion,
          wakeStartMs: current?.kind === 'wake' ? current.startMs : null,
        }
      }
      if (current) {
        const m = evaluateMotion(current.table, tMs - current.startMs)
        if (m.sayDue && !current.said) {
          current.said = true
          say = current.table.sayMoment
          if (current.kind === 'wake' || current.kind === 'twirl')
            particles = emitHeartBurst(particles, tMs)
        }
        if (!reduceMotion && (m.pose.dust || m.pose.land)) {
          particles = emitDust(
            particles,
            tMs,
            m.pose.dx,
            m.pose.flip,
            m.pose.land
          )
        }
        if (m.done) {
          playing = null
          ended = current.kind
        }
      }
      let petNow = pet ? petFrame(pet, tMs, reduceMotion) : null
      if (petNow) {
        const open = mouthOpen(petNow.sprite.face)
        if (mouthWasOpen && !open) mouthClosedAtMs = tMs
        mouthWasOpen = open
        if (!open && tMs < mouthClosedAtMs + MOUTH_CLOSING_MS) {
          const sprite = { ...petNow.sprite, mouthClosing: true }
          petNow = { ...petNow, sprite }
        }
      }
      particles = step(particles, tMs, petNow?.mood ?? 'happy', {
        gold: input.moments?.gold,
      })
      const buffer = composeScene(
        { ...input, pet, particles, reduceMotion },
        tMs,
        out,
        petNow
      )
      return {
        buffer,
        say,
        ended,
        petBox: pet && petNow ? petBox(pet, petNow, input.room.hat) : null,
        hearts:
          tMs < patUntilMs ||
          particles.particles.some((p) => p.kind === 'heart'),
      }
    },
    reset() {
      playing = null
      patUntilMs = 0
      squishUntilMs = 0
      pendingSay = null
      mouthWasOpen = false
      mouthClosedAtMs = -Infinity
      particles = createParticles(opts.seed ?? 1)
    },
  }
}
