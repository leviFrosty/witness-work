import { createContext } from 'react'

export type AnimationViewCtx = {
  playConfetti: () => void
}

export const AnimationViewContext = createContext<AnimationViewCtx | null>(null)
