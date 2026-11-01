import type { PetMoment, PetMood } from '../art/types'

export interface Pose {
  readonly dx: number

  readonly dy: number

  readonly flip: boolean

  readonly mood: PetMood

  readonly bobAdd: number

  readonly dust: boolean

  readonly land: boolean

  readonly lie: boolean
}

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

export interface MotionTable {
  readonly durationMs: number

  readonly sayAtMs: number

  readonly sayMoment: PetMoment

  pose(u: number): Partial<Pose>
}

export interface MotionFrame {
  readonly pose: Pose

  readonly done: boolean

  readonly sayDue: boolean
}
