import { emptySharedCar } from '@/lib/mileage/sharedCar'
import { isSpaceError } from '@/lib/sharedSpaces/client'
import { SPACE_ID_PATTERN } from '@/lib/sharedSpaces/crypto'
import { createEngineContext } from '@/app/sharedCars/engine/context'
import { createEndings } from '@/app/sharedCars/engine/endings'
import { createInvitations } from '@/app/sharedCars/engine/invites'
import { createKeyManagement } from '@/app/sharedCars/engine/keys'
import type { EngineParts } from '@/app/sharedCars/engine/parts'
import { createSharing } from '@/app/sharedCars/engine/sharing'
import { createCarSync } from '@/app/sharedCars/engine/syncing'
import {
  type CarSyncOptions,
  type CarSyncOutcome,
  SharedCarsError,
  type SharedCarsEngineDeps,
} from '@/app/sharedCars/engine/types'
import type { SharedCarProfile } from '@/app/sharedCars/profile'
import type { CarInvitePayload } from '@/types/sharedCars'

export * from '@/app/sharedCars/engine/types'

export function createSharedCarsEngine(given: SharedCarsEngineDeps) {
  const deps = { ...given, syncNow: () => Math.floor(given.syncNow()) }
  const ctx = createEngineContext(deps)
  const { store } = ctx

  const parts = {} as EngineParts
  parts.keys = createKeyManagement(ctx, parts)
  parts.sync = createCarSync(ctx, parts)
  parts.invites = createInvitations(ctx, parts)
  parts.endings = createEndings(ctx, parts)
  parts.sharing = createSharing(ctx, parts)
  const { sync: carSync, invites, endings, sharing } = parts

  const engine = {
    shareCar: sharing.shareCar,

    createInvite: invites.createInvite,

    cancelInvite: (spaceId: string, inviteId: string) =>
      invites.closeInvite(spaceId, inviteId),

    declineInvite: (spaceId: string, inviteId: string, tag: string) =>
      invites.closeInvite(spaceId, inviteId, tag, { automatic: true }),

    joinCar: (payload: CarInvitePayload, profile?: SharedCarProfile) =>
      invites.joinCar(payload, profile),

    confirmJoins: invites.confirmJoins,

    leaveCar: endings.leaveCar,

    removeMember: endings.removeMember,

    stopSharing: endings.stopSharing,

    leaveAll: endings.leaveAll,

    finishPendingEnds: () => endings.finishPendingEnds(),

    abandonShares: sharing.abandonShares,

    forgetAll() {
      ctx.reset()
      ctx.engineWrite(() => store.getState().reset())
      ctx.keyring.forgetAll()
      ctx.forgetMembers()
      parts.keys.forgetAll()
      carSync.forgetAll()
      deps.status?.setState({ cars: {}, live: {} })
    },

    syncCar: carSync.syncCar,

    async sync(
      options: Omit<CarSyncOptions, 'minSeq'> = {}
    ): Promise<Record<string, CarSyncOutcome | { error: string }>> {
      if (
        options.automatic &&
        (ctx.backPressure.coolingDown() || deps.canSync?.() === false)
      )
        return {}
      await endings.finishPendingEnds({ afterRoster: true })
      await invites.confirmJoins()
      await sharing.resumeShares()
      const outcomes: Record<string, CarSyncOutcome | { error: string }> = {}
      await Promise.all(
        Object.keys(ctx.cars()).map(async (spaceId) => {
          try {
            outcomes[spaceId] = await carSync.syncCar(spaceId, options)
          } catch (error) {
            outcomes[spaceId] = {
              error:
                isSpaceError(error) || error instanceof SharedCarsError
                  ? error.code
                  : 'unknown',
            }
          }
        })
      )
      return outcomes
    },

    carGone: (spaceId: string): Promise<CarSyncOutcome> =>
      carSync.syncCar(spaceId),

    addCarFromRoster(spaceId: string, at: number): Promise<CarSyncOutcome> {
      if (!SPACE_ID_PATTERN.test(spaceId)) return Promise.resolve('missing')
      const left = store.getState().memberships.leftCars[spaceId]
      if (left !== undefined && left >= at) return Promise.resolve('skipped')
      ctx.engineWrite(() => store.getState().noteJoined(spaceId, at))
      const state = store.getState()
      if (state.cars[spaceId] || state.seeding[spaceId])
        return Promise.resolve('skipped')
      return ctx
        .serial(spaceId, async () => {
          const member = await ctx.memberFor(spaceId)
          if (!ctx.cars()[spaceId])
            ctx.engineWrite(() =>
              store
                .getState()
                .saveSharedCar(
                  emptySharedCar(spaceId, { myMemberId: member.memberId })
                )
            )
        })
        .then(() => carSync.syncCar(spaceId))
    },

    dropCarFromRoster: endings.dropCarFromRoster,

    async openLive(spaceId: string) {
      return ctx.client.openLive(ctx.auth(await ctx.memberFor(spaceId)))
    },

    coolingDownUntil: () => ctx.backPressure.until(),

    isWriting: ctx.isWriting,

    cancel: ctx.cancel,
  }
  return engine
}

export type SharedCarsEngine = ReturnType<typeof createSharedCarsEngine>
