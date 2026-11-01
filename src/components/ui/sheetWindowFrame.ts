import { createContext, useContext } from 'react'

export type SheetWindowFrame = { x: number; y: number; scale: number }

type Rect = { x: number; y: number; width: number; height: number }

export const SheetWindowFrameContext = createContext<SheetWindowFrame | null>(
  null
)

export function useToWindow() {
  const frame = useContext(SheetWindowFrameContext)
  return (rect: Rect): Rect =>
    frame
      ? {
          x: frame.x + rect.x * frame.scale,
          y: frame.y + rect.y * frame.scale,
          width: rect.width * frame.scale,
          height: rect.height * frame.scale,
        }
      : rect
}
