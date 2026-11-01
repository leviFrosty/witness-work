import { create, createStore } from 'zustand'
import type { LiveDiagnostics } from '@/lib/liveSignalDiagnostics'
import type { SpaceErrorCode } from '@/lib/sharedSpaces/client'

export type SharedCarSyncStatus = {
  syncing: boolean

  lastSyncAt?: number

  lastError?: SpaceErrorCode

  held?: number

  tooLarge?: number

  waitingForKey?: boolean
}

export type SharedCarsSessionState = {
  running: boolean

  suspended: boolean

  disabled: boolean

  cars: Record<string, SharedCarSyncStatus>

  live: Record<string, LiveDiagnostics>
}

export const initialSharedCarsSession: SharedCarsSessionState = {
  running: false,
  suspended: false,
  disabled: false,
  cars: {},
  live: {},
}

export const useSharedCarsSession = create<SharedCarsSessionState>()(
  () => initialSharedCarsSession
)

export const createSharedCarsSessionStore = () =>
  createStore<SharedCarsSessionState>()(() => initialSharedCarsSession)

export type SharedCarsSessionStore = Pick<
  typeof useSharedCarsSession,
  'getState' | 'setState' | 'subscribe'
>
