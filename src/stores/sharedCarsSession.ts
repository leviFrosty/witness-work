import { create, createStore } from 'zustand'
import type { LiveDiagnostics } from '@/lib/liveSignalDiagnostics'
import type { SpaceErrorCode } from '@/lib/sharedSpaces/client'

/** How one Shared Car's syncing stands this app session. */
export type SharedCarSyncStatus = {
  syncing: boolean
  /** When a sync of it last worked (device clock). */
  lastSyncAt?: number
  /** Why its last sync failed, until one works. */
  lastError?: SpaceErrorCode
  /**
   * Changes made here that aren't being shared because they're stamped more
   * than about 23 h past the server's clock (this device's clock is ahead).
   * They go out once the clock catches up.
   */
  held?: number
  /**
   * Changes made here too large to share (a record past the 16 KB cap, such as
   * a very long note). They stay on this device until they're made shorter.
   */
  tooLarge?: number
  /**
   * This device can't open the car yet: nothing vouches for its current key.
   * What it already had still shows; changes made here wait until it can.
   */
  waitingForKey?: boolean
}

export type SharedCarsSessionState = {
  /** The engine runs: the flag is on, Buddies is started, a session exists. */
  running: boolean
  /**
   * A put was refused because the account is suspended, and none has worked
   * since: changes stay on this device until one does, and the cars aren't
   * being shared meanwhile.
   */
  suspended: boolean
  /** The server's kill switch refused a call, and none has worked since. */
  disabled: boolean
  /** By `spaceId`. */
  cars: Record<string, SharedCarSyncStatus>
  /** Each car's live signal, by `spaceId`, for the developer Tools. */
  live: Record<string, LiveDiagnostics>
}

export const initialSharedCarsSession: SharedCarsSessionState = {
  running: false,
  suspended: false,
  disabled: false,
  cars: {},
  live: {},
}

/**
 * What this app session has learned about reaching Shared Cars. In memory only:
 * a fresh launch starts clean and finds out again on its first sync.
 */
export const useSharedCarsSession = create<SharedCarsSessionState>()(
  () => initialSharedCarsSession
)

/** A session store of its own, for tests and headless members. */
export const createSharedCarsSessionStore = () =>
  createStore<SharedCarsSessionState>()(() => initialSharedCarsSession)

export type SharedCarsSessionStore = Pick<
  typeof useSharedCarsSession,
  'getState' | 'setState' | 'subscribe'
>
