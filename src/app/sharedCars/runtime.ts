import { AppState } from 'react-native'
import {
  addBackgroundListener,
  addForegroundListener,
} from '@/lib/appLifecycle'
import type { LiveSignal } from '@/lib/liveSignal'
import {
  applyLiveEvent,
  initialLiveDiagnostics,
} from '@/lib/liveSignalDiagnostics'
import { logger } from '@/lib/logger'
import { isSpaceError } from '@/lib/sharedSpaces/client'
import { createSpaceLive } from '@/lib/sharedSpaces/live'
import type { SharedCarsStore } from '@/stores/sharedCars'
import type { SharedCarsSessionStore } from '@/stores/sharedCarsSession'
import type { SharedCarsEngine } from '@/app/sharedCars/engine'
import { watchLocalChanges } from '@/app/sharedCars/triggers'

const logFailure = (error: unknown) =>
  logger.warn(
    '[sharedCars] background',
    isSpaceError(error)
      ? error.code
      : error instanceof Error
        ? error.name
        : 'unknown'
  )

export type SharedCarsRuntimeDeps = {
  engine: SharedCarsEngine
  store: SharedCarsStore
  status: SharedCarsSessionStore
  /** Whether the server can be reached now: a session, no Update Required. */
  ready: () => boolean
  /** Calls back when `ready` may have changed. Returns the unsubscribe. */
  watchReady: (onChange: () => void) => () => void
  /**
   * Brings the cars here in line with the memberships (the Buddies roster's
   * cars), which it may have brought while this didn't run. Runs on start.
   */
  reconcileMemberships?: () => void
  /**
   * The cars the User is on, or has left, changed: the roster takes them to
   * their other devices.
   */
  onMembershipsChanged?: () => void
  /**
   * Calls back when what the User's member record says may have changed (their
   * Buddy Card's name or photo). Returns the unsubscribe.
   */
  watchProfile?: (onChange: () => void) => () => void
}

/** A profile change waits this long for more before every car syncs. */
const PROFILE_SYNC_DELAY_MS = 2000

/**
 * After a `4001`, how long before the sync that confirms it is tried again when
 * one fails, longer each time in a row.
 */
export const GONE_RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 300_000]

/**
 * Keeps the User's Shared Cars in step while the app runs
 * (docs/shared-cars-protocol.md, "When it syncs"): syncs every car on start, on
 * every return to the app, and when a session opens; one car 2 s after a change
 * made here, and when its live signal says another device changed it
 * (`changed`, or a `hello` past this device's cursor). Each car has its own
 * live signal while the app is in the foreground, off while the server's kill
 * switch is on. Returns the stop function.
 */
export function startSharedCarsRuntime({
  engine,
  store,
  status,
  ready,
  watchReady,
  reconcileMemberships,
  onMembershipsChanged,
  watchProfile,
}: SharedCarsRuntimeDeps): () => void {
  const lives = new Map<string, LiveSignal>()
  /** Confirming syncs to try again after a `4001`, by car. */
  const goneRetries = new Map<string, ReturnType<typeof setTimeout>>()
  const automatic = { automatic: true } as const

  const syncAll = () => void engine.sync(automatic).catch(logFailure)
  const syncCar = (spaceId: string, minSeq?: number) =>
    engine.syncCar(spaceId, { ...automatic, minSeq }).catch(logFailure)

  const liveFor = (spaceId: string) =>
    createSpaceLive({
      open: () => engine.openLive(spaceId),
      syncedSeq: () => store.getState().cars[spaceId]?.seq ?? 0,
      onChange: (seq) => void syncCar(spaceId, seq),
      // After a refused handshake: a sync's 401 refreshes the session's token
      // before the next connection sends it.
      verify: () => syncCar(spaceId),
      onEvent: (event) =>
        status.setState((state) => ({
          live: {
            ...state.live,
            [spaceId]: applyLiveEvent(
              state.live[spaceId] ?? initialLiveDiagnostics,
              event,
              Date.now()
            ),
          },
        })),
      onGone: () => confirmGone(spaceId),
    })

  /**
   * After a `4001`: only a sync's answer ends a car, and one still here after
   * it gets its signal back (a socket from before the User joined again closes
   * so). A sync that fails is tried again, waiting longer each time, while the
   * car's signal is wanted.
   */
  const confirmGone = (spaceId: string, attempt = 0) => {
    const live = lives.get(spaceId)
    void engine.carGone(spaceId).then(
      (outcome) => {
        if (outcome !== 'ended' && store.getState().cars[spaceId])
          lives.get(spaceId)?.reconnect()
      },
      (error: unknown) => {
        logFailure(error)
        if (!live || lives.get(spaceId) !== live) return
        clearTimeout(goneRetries.get(spaceId))
        const delay =
          GONE_RETRY_DELAYS_MS[
            Math.min(attempt, GONE_RETRY_DELAYS_MS.length - 1)
          ]
        goneRetries.set(
          spaceId,
          setTimeout(() => {
            goneRetries.delete(spaceId)
            if (lives.get(spaceId) === live) confirmGone(spaceId, attempt + 1)
          }, delay)
        )
      }
    )
  }

  /** One live signal per car, while in the foreground and not switched off. */
  const reconcileLive = () => {
    const wanted =
      AppState.currentState === 'active' &&
      !status.getState().disabled &&
      ready()
    const spaceIds = new Set(wanted ? Object.keys(store.getState().cars) : [])
    for (const [spaceId, live] of lives)
      if (!spaceIds.has(spaceId)) {
        live.stop()
        lives.delete(spaceId)
        clearTimeout(goneRetries.get(spaceId))
        goneRetries.delete(spaceId)
      }
    for (const spaceId of spaceIds)
      if (!lives.has(spaceId)) {
        const live = liveFor(spaceId)
        lives.set(spaceId, live)
        live.start()
      }
  }
  const stopLive = () => {
    for (const live of lives.values()) live.stop()
    lives.clear()
    for (const timer of goneRetries.values()) clearTimeout(timer)
    goneRetries.clear()
  }

  status.setState({ running: true })
  reconcileMemberships?.()
  syncAll()
  reconcileLive()

  // A real return from the background; Control Center and Face ID aren't.
  const foreground = addForegroundListener(() => {
    syncAll()
    reconcileLive()
  })
  const background = addBackgroundListener(stopLive)
  const localChanges = watchLocalChanges(
    store,
    (spaceId) => void syncCar(spaceId),
    {
      isEngineWrite: engine.isWriting,
    }
  )
  // Joined, shared, or left: the User's other devices follow.
  const memberships = store.subscribe((state, previous) => {
    if (state.memberships !== previous.memberships) onMembershipsChanged?.()
  })
  // Each car's next sync rewrites the User's member record.
  let profileTimer: ReturnType<typeof setTimeout> | undefined
  const profile = watchProfile?.(() => {
    clearTimeout(profileTimer)
    profileTimer = setTimeout(syncAll, PROFILE_SYNC_DELAY_MS)
  })
  // A car shared, joined, or ended gets (or loses) its live signal.
  const cars = store.subscribe((state, previous) => {
    if (state.cars === previous.cars) return
    const before = Object.keys(previous.cars)
    const after = Object.keys(state.cars)
    if (
      before.length !== after.length ||
      after.some((id) => !previous.cars[id])
    )
      reconcileLive()
  })
  // The kill switch turned on: the signals go; off again (a call worked):
  // they come back.
  const switched = status.subscribe((state, previous) => {
    if (state.disabled !== previous.disabled) reconcileLive()
  })
  // A session opened, or the account changed: every car again.
  const readiness = watchReady(() => {
    syncAll()
    reconcileLive()
  })

  return () => {
    foreground.remove()
    background.remove()
    localChanges()
    memberships()
    profile?.()
    clearTimeout(profileTimer)
    cars()
    switched()
    readiness()
    stopLive()
    engine.cancel()
    status.setState({ running: false, live: {} })
  }
}
