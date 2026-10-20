/**
 * Motion choreography types. A motion is a pure function of elapsed time:
 * `pose(u)` says where the pet is and how it looks `u` ms after the motion
 * started. Offsets are scene pixels relative to the pet's resting spot (sprite
 * top-left at 52, 52); negative `dy` is up.
 */
import type { PetMoment, PetMood } from '../art/types'

/** The pet's pose at one instant of a motion. */
export interface Pose {
  /** Horizontal offset from the resting spot (scene pixels). */
  readonly dx: number
  /** Vertical offset (negative is up). */
  readonly dy: number
  /** Facing right (sprites face left by default). */
  readonly flip: boolean
  /** Mood shown during the motion (face, bob speed). */
  readonly mood: PetMood
  /** Extra head bob in pixels (crouch, squash on landing). */
  readonly bobAdd: number
  /** Kick up a dust puff this frame. */
  readonly dust: boolean
  /** Landing: a dust puff on both sides. */
  readonly land: boolean
  /** Lying down (rolling over). */
  readonly lie: boolean
}

/** The pose a motion leaves the pet in, and the default for unset fields. */
export const REST_POSE: Pose = {
  dx: 0,
  dy: 0,
  flip: false,
  mood: 'happy',
  bobAdd: 0,
  dust: false,
  land: false,
  lie: false,
}

/** A choreographed motion (entrance, trick, wake). */
export interface MotionTable {
  /** Total length; the motion is over once elapsed time passes it. */
  readonly durationMs: number
  /** When the pet makes its sound. */
  readonly sayAtMs: number
  /** Which sound it makes. */
  readonly sayMoment: PetMoment
  /** The pose `u` ms in; unset fields fall back to {@link REST_POSE}. */
  pose(u: number): Partial<Pose>
}

/** A motion evaluated at one instant. */
export interface MotionFrame {
  readonly pose: Pose
  /** Elapsed time has passed `durationMs`. */
  readonly done: boolean
  /** Elapsed time has reached `sayAtMs` (the caller says it once). */
  readonly sayDue: boolean
}
