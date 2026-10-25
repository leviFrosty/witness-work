/**
 * A live scene: keeps the per-view state that {@link composeScene} takes as
 * input (the motion playing, pat timers, particles) and turns taps, rubs and
 * motion requests into frames and events. Pure TypeScript: the render layer
 * owns the clock and calls {@link ScenePlayer.frame} on each tick.
 */
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
import type { PetMoment, PetMood, PetSpeciesId } from './types'

/** Kinds of motion a player can play. */
export type MotionKind = 'entrance' | 'trick' | 'twirl' | 'wake'

/** The companion's lasting state, as the player needs it. */
export interface PlayerPet {
  readonly species: PetSpeciesId
  readonly coat: string
  readonly mood: PetMood
  readonly seed: number
}

/** A frame's input without the state the player keeps. */
export type PlayerInput = Omit<
  SceneInput,
  'pet' | 'particles' | 'reduceMotion'
> & {
  readonly pet: PlayerPet | null
}

/** What happened this frame. */
export interface PlayerFrame {
  readonly buffer: PixelBuffer
  /** A sound to play / bubble to show this frame. */
  readonly say: PetMoment | null
  /** A motion that finished this frame. */
  readonly ended: MotionKind | null
  /** The scene pixels the pet (and its hat) covers, or null with no pet. */
  readonly petBox: Viewport | null
  /** A heart is still floating up, or the pet is still happy from a pat. */
  readonly hearts: boolean
}

/** Result of a tap or rub. */
export type PatResult = 'pat' | 'wake' | 'busy'

const PAT_JOY_MS = 1500
const SQUISH_MS = 160

/** A stateful driver for one on-screen scene. */
export interface ScenePlayer {
  /**
   * Plays `species`' entrance from `tMs` (skipped with Reduce Motion: the pet
   * just says hi).
   */
  playEntrance(species: PetSpeciesId, tMs: number): void
  /** Plays `species`' trick from `tMs` (skipped with Reduce Motion). */
  playTrick(species: PetSpeciesId, tMs: number): void
  /**
   * Plays the scratch twirl from `tMs` (with Reduce Motion: just the hearts and
   * the happy sound).
   */
  playTwirl(tMs: number): void
  /** Plays the wake animation of a pet that died. */
  playWake(tMs: number): void
  /**
   * The pet is happy for 1.5 s, says so, and a burst of hearts floats up (its
   * hearts went up). Ignored during a motion.
   */
  cheer(tMs: number): void
  /**
   * A tap (or a rub step, every ~28 px of travel). Asleep or died: returns
   * `wake` (the caller records the wake, then calls {@link playWake} if it
   * died). During a motion: `busy`. Otherwise the pet is happy for 1.5 s (a tap
   * also squishes its head) and a heart floats up.
   */
  pat(tMs: number, mood: PetMood, opts?: { readonly rub?: boolean }): PatResult
  /** Whether a motion is playing (pats are ignored meanwhile). */
  isBusy(): boolean
  /** Turns Reduce Motion on or off for later frames and motions. */
  setReduceMotion(on: boolean): void
  /** Composes the frame at `tMs`, advancing particles and motions. */
  frame(input: PlayerInput, tMs: number, out?: PixelBuffer): PlayerFrame
  /** Drops motions, timers and particles. */
  reset(): void
}

interface Playing {
  readonly kind: MotionKind
  readonly table: MotionTable
  readonly startMs: number
  said: boolean
}

/** A new player; `seed` makes its particle randomness repeatable. */
export function createScenePlayer(
  opts: { seed?: number; reduceMotion?: boolean } = {}
): ScenePlayer {
  let particles: ParticleState = createParticles(opts.seed ?? 1)
  let playing: Playing | null = null
  let patUntilMs = 0
  let squishUntilMs = 0
  let pendingSay: PetMoment | null = null
  let reduceMotion = opts.reduceMotion ?? false

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
      const petNow = pet ? petFrame(pet, tMs, reduceMotion) : null
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
      particles = createParticles(opts.seed ?? 1)
    },
  }
}
