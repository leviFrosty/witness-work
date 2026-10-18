import { create } from 'zustand'

/**
 * The screen being rearranged, like the Home Screen's jiggle mode: one at a
 * time, in memory only. `surface` names the screen (e.g. `home`); `source` is
 * how editing started and `snapshot` is whatever that screen saved to compare
 * against when editing ends. See `useEditMode`.
 */
export type EditModeSession = {
  surface: string
  source: string
  snapshot: unknown
}

export const useEditModeStore = create<{
  session: EditModeSession | null
  /** The screen's gallery of things to add is open (its header's Add). */
  adding: boolean
}>(() => ({ session: null, adding: false }))
