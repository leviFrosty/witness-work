import { create } from 'zustand'

export type TerritoriesSessionState = {
  running: boolean

  syncing: Record<string, boolean>

  lastSyncAt: Record<string, number>
}

export const initialTerritoriesSession: TerritoriesSessionState = {
  running: false,
  syncing: {},
  lastSyncAt: {},
}

export const useTerritoriesSession = create<TerritoriesSessionState>()(
  () => initialTerritoriesSession
)
