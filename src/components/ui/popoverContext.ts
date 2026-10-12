import { createContext, useContext } from 'react'
import type { PopoverControls } from '@/components/ui/Popover.types'

/** The popover around some content, so nested content can close it first. */
export const PopoverContext = createContext<PopoverControls | null>(null)

/**
 * Runs `action` once the enclosing popover is gone, or right away outside one.
 * For content deep inside a popover that presents something (a paywall).
 */
export function useAfterPopover(): (action: () => void) => void {
  const popover = useContext(PopoverContext)
  return popover ? popover.closeThen : (action) => action()
}
