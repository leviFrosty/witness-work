import { createContext } from 'react'
import type { ConfettiConfig } from '../vendor/ConfettiSkia'

export type FireOpts = {
  /** Particles per burst. Default 28. */
  count?: number
  /** Initial particle velocity. Default 240. */
  velocity?: number
  /** Whether particles fade out. Default true. */
  fade?: boolean
  /** Delay between bursts in ms. Default 180. */
  staggerMs?: number
  /**
   * Burst positions in fractional screen coordinates [0..1]. Resolved against
   * the current window dimensions when fired so positions stay
   * device-independent. Default = 5 spots fanned across the upper-mid band.
   */
  spots?: { x: number; y: number }[]
}

export type FireworksCtx = {
  /** Trigger a fireworks burst. Empty call uses defaults. */
  fire: (opts?: FireOpts) => void
  /** Underlying single-burst trigger; bypasses the staggered fan-out. */
  triggerBurst: (config?: Partial<ConfettiConfig>) => void
}

export const ConfettiContext = createContext<FireworksCtx | null>(null)
