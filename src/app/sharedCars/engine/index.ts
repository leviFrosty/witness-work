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

/**
 * The Shared Cars engine (ADR 0037, docs/shared-cars-protocol.md "Lifecycle"):
 * shares one of the User's own cars into a space, invites and joins, keeps
 * every car in step with its space, rekeys after someone goes, and leaves each
 * person a personal copy when a car ends for them. Pure, with its server,
 * stores, keys and clocks injected, so tests and the interop check run several
 * people at once; `sharedCarsService` is the app's one instance.
 *
 * Its parts: `keys` (wraps, the key chain, rekeys), `syncing` (pull, merge,
 * upkeep, put), `invites` (inviting and joining), `endings` (leaving, removal,
 * stopping) and `sharing` (seeding a new car). This facade puts them together.
 *
 * Every operation on one space runs after the one before it (a sync asked for
 * while one runs gets one more afterwards, shared by everyone who asked).
 * Automatic work waits while the server asked to back off; the User's own calls
 * still go. Nothing it logs or reports names a space, a member, or a secret.
 */
export function createSharedCarsEngine(given: SharedCarsEngineDeps) {
  // The synced clock has fractions of a millisecond; the server, the roster,
  // and the personal copy's ids take whole ones.
  const deps = { ...given, syncNow: () => Math.floor(given.syncNow()) }
  const ctx = createEngineContext(deps)
  const { store } = ctx
  // Each part calls the others only once everything's running.
  const parts = {} as EngineParts
  parts.keys = createKeyManagement(ctx, parts)
  parts.sync = createCarSync(ctx, parts)
  parts.invites = createInvitations(ctx, parts)
  parts.endings = createEndings(ctx, parts)
  parts.sharing = createSharing(ctx, parts)
  const { sync: carSync, invites, endings, sharing } = parts

  const engine = {
    /**
     * Shares one of the User's own cars: makes its space and key, seeds every
     * record, then moves the car out of their own store. A share that stopped
     * part-way resumes from what landed (also on the next `sync`).
     */
    shareCar: sharing.shareCar,

    /**
     * Invites a person (`name`, their Buddy Card name, and `tag`, their inbox
     * hashed for this car: `memberTag`). Returns what the `car.invite` event
     * carries; the invite record goes out with it.
     */
    createInvite: invites.createInvite,

    /**
     * The inviter cancels an invitation (then sends `car.cancel`). Kept until
     * the server has heard: `pending` while it hasn't.
     */
    cancelInvite: (spaceId: string, inviteId: string) =>
      invites.closeInvite(spaceId, inviteId),

    /**
     * The invitee declined (`car.reply`): the inviter closes it, when it went
     * to them (`tag`, their inbox hashed for the car: `memberTag`).
     */
    declineInvite: (spaceId: string, inviteId: string, tag: string) =>
      invites.closeInvite(spaceId, inviteId, tag, { automatic: true }),

    /**
     * Joins a car from its invitation: registers this User's own key, token and
     * wrap, puts their member record, and syncs from the start. A join whose
     * answer was lost is confirmed by the next `sync`.
     */
    joinCar: (payload: CarInvitePayload, profile?: SharedCarProfile) =>
      invites.joinCar(payload, profile),

    /**
     * Finds out whether each join whose answer was lost (`joining`) landed,
     * with a sync as the User's member: one that did brings its car here, one
     * that didn't goes, and one the server didn't answer waits for the next
     * `sync`. Also part of every `sync`.
     */
    confirmJoins: invites.confirmJoins,

    /**
     * Leaves a car: syncs what changed here, keeps a personal copy, and leaves
     * the space (the server hears now, or on a later sync). When the owner
     * leaves, whoever joined first takes the car over.
     */
    leaveCar: endings.leaveCar,

    /**
     * The owner removes someone, named or not yet (`unnamedMembers`); the key
     * changes right after.
     */
    removeMember: endings.removeMember,

    /**
     * The owner stops sharing: syncs, keeps their own copy, and deletes the
     * space. Everyone else gets `gone` and keeps a copy too.
     */
    stopSharing: endings.stopSharing,

    /**
     * Leaves every car the User is on, keeping a copy of each (cars this device
     * knows only from the roster too), and drops any share still seeding: for
     * Delete My Buddies Data, before the seed goes (the seed is what proves
     * membership), and Delete All Mileage. `notLeft` names the cars the server
     * hasn't heard leave yet, and `pending` counts them; they're retried on
     * later syncs while the seed lasts.
     */
    leaveAll: endings.leaveAll,

    /**
     * Tells the server about every end this device made that it hasn't heard
     * yet (while the seed that proves membership lasts). `pending` counts the
     * ones it still hasn't.
     */
    finishPendingEnds: () => endings.finishPendingEnds(),

    /**
     * Stops every share still seeding, deleting its space if it was made: the
     * car stays the User's own. For when this device lets go of the account.
     */
    abandonShares: sharing.abandonShares,

    /**
     * Forgets every car on this device, with no personal copy and nothing sent:
     * for leaving the account on one device while its others stay on the cars
     * (they come back from the roster on signing in again), or for a new seed,
     * whose member values aren't on them. Stops what's in flight and what's
     * queued first: nothing started before writes anything after.
     */
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

    /**
     * Syncs every car: ends the server hasn't heard, joins whose answer was
     * lost, shares still seeding, then each car. Resolves each car's outcome,
     * or its failure's code.
     */
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

    /**
     * The server closed a car's live signal with `4001 "gone"`: a sync confirms
     * it (and ends the car, with its copy) before anything is dropped, since a
     * socket from before the User joined again closes so too. The caller
     * reconnects when the car is still here.
     */
    carGone: (spaceId: string): Promise<CarSyncOutcome> =>
      carSync.syncCar(spaceId),

    /**
     * The Buddies roster brought a car the User is on from another of their
     * devices (`cars`): starts syncing it here. Nothing when this device left
     * it at or after `at`, or already has it. A leave this device still owed
     * goes: the User is on the car again.
     */
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

    /**
     * The Buddies roster says another of the User's devices left a car
     * (`leftCars`): it ends here too, with the same personal copy that device
     * made, unless the User joined it again since.
     */
    dropCarFromRoster: endings.dropCarFromRoster,

    /** Opens a car's live signal, as this User's member. */
    async openLive(spaceId: string) {
      return ctx.client.openLive(ctx.auth(await ctx.memberFor(spaceId)))
    },

    /** The automatic work waits until then (epoch ms), 0 when it needn't. */
    coolingDownUntil: () => ctx.backPressure.until(),

    /** The engine itself is writing the store (not the User's change). */
    isWriting: ctx.isWriting,

    /** Cancels everything in flight, when the engine stops. */
    cancel: ctx.cancel,
  }
  return engine
}

export type SharedCarsEngine = ReturnType<typeof createSharedCarsEngine>
