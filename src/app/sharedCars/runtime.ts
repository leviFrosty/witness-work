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

  ready: () => boolean

  watchReady: (onChange: () => void) => () => void

  reconcileMemberships?: () => void

  onMembershipsChanged?: () => void

  watchProfile?: (onChange: () => void) => () => void
}

const PROFILE_SYNC_DELAY_MS = 2000

export const GONE_RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 300_000]

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

  const memberships = store.subscribe((state, previous) => {
    if (state.memberships !== previous.memberships) onMembershipsChanged?.()
  })

  let profileTimer: ReturnType<typeof setTimeout> | undefined
  const profile = watchProfile?.(() => {
    clearTimeout(profileTimer)
    profileTimer = setTimeout(syncAll, PROFILE_SYNC_DELAY_MS)
  })

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

  const switched = status.subscribe((state, previous) => {
    if (state.disabled !== previous.disabled) reconcileLive()
  })

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
