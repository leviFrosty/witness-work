import { createContext } from 'react'

export type AnimationViewCtx = {
  /** Renders a full-screen animation above all other UI */
  playConfetti: () => void
}

export const AnimationViewContext = createContext<AnimationViewCtx | null>(null)
