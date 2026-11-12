import { AppState } from 'react-native'
import {
  addBackgroundListener,
  addForegroundListener,
} from '@/lib/appLifecycle'
import type { LiveSignal } from '@/lib/liveSignal'
import { logger } from '@/lib/logger'
import { isSpaceError } from '@/lib/sharedSpaces/client'
import { createSpaceLive } from '@/lib/sharedSpaces/live'
import type { TerritoriesState } from '@/features/territories/stores/territories'
import type { TerritoryEngine } from '@/app/territories/engine'

export const LOCAL_CHANGE_SYNC_DELAY_MS = 2000

const logFailure = (error: unknown) =>
  logger.warn(
    '[territories] background',
    isSpaceError(error)
      ? error.code
      : error instanceof Error
        ? error.name
        : 'unknown'
  )

export type TerritoriesRuntimeDeps = {
  engine: Pick<TerritoryEngine, 'syncAll' | 'syncSpace' | 'openLive' | 'cancel'>
  store: {
    getState: () => TerritoriesState
    subscribe: (
      listener: (state: TerritoriesState, previous: TerritoriesState) => void
    ) => () => void
  }
  ready: () => boolean
  watchReady: (onChange: () => void) => () => void
  watchPrivacy: (onChange: () => void) => () => void
  reconcileMemberships?: () => void
  onMembershipsChanged?: () => void
  setRunning: (running: boolean) => void
}

export function startTerritoriesRuntime({
  engine,
  store,
  ready,
  watchReady,
  watchPrivacy,
  reconcileMemberships,
  onMembershipsChanged,
  setRunning,
}: TerritoriesRuntimeDeps): () => void {
  const lives = new Map<string, LiveSignal>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const automatic = { automatic: true } as const

  const syncAll = () => void engine.syncAll(automatic).catch(logFailure)
  const syncSpace = (spaceId: string) =>
    engine.syncSpace(spaceId, automatic).catch(logFailure)

  const liveFor = (spaceId: string) =>
    createSpaceLive({
      open: () => engine.openLive(spaceId),
      syncedSeq: () => store.getState().spaces[spaceId]?.seq ?? 0,
      onChange: () => void syncSpace(spaceId),
      verify: () => syncSpace(spaceId),
      onGone: () => void syncSpace(spaceId),
    })

  const reconcileLive = () => {
    const wanted = AppState.currentState === 'active' && ready()
    const spaceIds = new Set(wanted ? Object.keys(store.getState().spaces) : [])
    for (const [spaceId, live] of lives)
      if (!spaceIds.has(spaceId)) {
        live.stop()
        lives.delete(spaceId)
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
  }

  const schedule = (spaceId: string) => {
    clearTimeout(timers.get(spaceId))
    timers.set(
      spaceId,
      setTimeout(() => {
        timers.delete(spaceId)
        void syncSpace(spaceId)
      }, LOCAL_CHANGE_SYNC_DELAY_MS)
    )
  }

  setRunning(true)
  reconcileMemberships?.()
  syncAll()
  reconcileLive()

  const foreground = addForegroundListener(() => {
    syncAll()
    reconcileLive()
  })
  const background = addBackgroundListener(stopLive)

  const spaces = store.subscribe((state, previous) => {
    if (state.memberships !== previous.memberships) onMembershipsChanged?.()
    if (state.spaces === previous.spaces) return
    let added = false
    for (const [spaceId, space] of Object.entries(state.spaces)) {
      const before = previous.spaces[spaceId]
      if (!before) added = true
      if (
        before &&
        space.pending !== before.pending &&
        space.pending.some((id) => !before.pending.includes(id))
      )
        schedule(spaceId)
    }
    if (added || Object.keys(previous.spaces).some((id) => !state.spaces[id]))
      reconcileLive()
  })

  const privacy = watchPrivacy(syncAll)

  const readiness = watchReady(() => {
    syncAll()
    reconcileLive()
  })

  return () => {
    foreground.remove()
    background.remove()
    spaces()
    privacy()
    readiness()
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    stopLive()
    engine.cancel()
    setRunning(false)
  }
}
