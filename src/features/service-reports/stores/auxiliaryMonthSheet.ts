import { create } from 'zustand'

export const useAuxiliaryMonthSheet = create<{ open: boolean }>(() => ({
  open: false,
}))

export function openAuxiliaryMonthSheet() {
  useAuxiliaryMonthSheet.setState({ open: true })
}
