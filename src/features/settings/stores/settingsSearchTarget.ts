import { create } from 'zustand'
import type { SettingsSearchItemId } from '@/features/settings/lib/settingsSearch'

export const SETTINGS_SEARCH_TARGET_TTL_MS = 4000

type Target = { id: SettingsSearchItemId; requestedAt: number }

type SettingsSearchTargetState = {
  target: Target | null
  request: (id: SettingsSearchItemId) => void
  clear: (requestedAt: number) => void
}

const useSettingsSearchTarget = create<SettingsSearchTargetState>((set) => ({
  target: null,
  request: (id) => set({ target: { id, requestedAt: Date.now() } }),
  clear: (requestedAt) =>
    set((state) =>
      state.target?.requestedAt === requestedAt ? { target: null } : state
    ),
}))

export function isSettingsSearchTargetFresh(target: Target | null): boolean {
  return (
    target !== null &&
    Date.now() - target.requestedAt < SETTINGS_SEARCH_TARGET_TTL_MS
  )
}

export default useSettingsSearchTarget
