import { create } from 'zustand'

/** Opens the auxiliary pioneering sheet from outside the Service Report card. */
export const useAuxiliaryMonthSheet = create<{ open: boolean }>(() => ({
  open: false,
}))

export function openAuxiliaryMonthSheet() {
  useAuxiliaryMonthSheet.setState({ open: true })
}
