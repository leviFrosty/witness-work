import { createContext, useContext } from 'react'
import type { PopoverControls } from '@/components/ui/Popover.types'

export const PopoverContext = createContext<PopoverControls | null>(null)

export function useAfterPopover(): (action: () => void) => void {
  const popover = useContext(PopoverContext)
  return popover ? popover.closeThen : (action) => action()
}
