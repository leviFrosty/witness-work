import { create } from 'zustand'

export type EditModeSession = {
  surface: string
  source: string
  snapshot: unknown
}

export const useEditModeStore = create<{
  session: EditModeSession | null

  adding: boolean
}>(() => ({ session: null, adding: false }))
