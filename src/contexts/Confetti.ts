import { createContext } from 'react'
import type { ConfettiConfig } from '@/vendor/ConfettiSkia'

export type FireOpts = {
  count?: number

  velocity?: number

  fade?: boolean

  staggerMs?: number

  spots?: { x: number; y: number }[]
}

export type FireworksCtx = {
  fire: (opts?: FireOpts) => void

  triggerBurst: (config?: Partial<ConfettiConfig>) => void
}

export const ConfettiContext = createContext<FireworksCtx | null>(null)
