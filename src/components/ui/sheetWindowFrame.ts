import { createContext, useContext } from 'react'

/**
 * Where an open sheet's content sits in the window: its top-left corner, and
 * the scale it's drawn at (iOS 26 draws a short sheet slightly scaled down).
 */
export type SheetWindowFrame = { x: number; y: number; scale: number }

type Rect = { x: number; y: number; width: number; height: number }

/**
 * Content in a native sheet lives in its own window, where `measureInWindow`
 * measures from the top of the sheet's content instead of the screen. The
 * native sheet provides where that content sits; `null` outside a sheet.
 */
export const SheetWindowFrameContext = createContext<SheetWindowFrame | null>(
  null
)

/**
 * Turns a rect from `measureInWindow` into window coordinates, so something
 * drawn over the whole window (a popover in an RN `Modal`) can line up with a
 * view inside a sheet. Outside a sheet the rect is already in the window's.
 */
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
