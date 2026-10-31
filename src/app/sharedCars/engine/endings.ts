import {
  activeSharedCarIds,
  emptySharedCar,
  isOnSharedCar,
} from '@/lib/mileage/sharedCar'
import { isSpaceError } from '@/lib/sharedSpaces/client'
import { SPACE_ID_PATTERN } from '@/lib/sharedSpaces/crypto'
import { movePersonalRecords } from '@/app/sharedCars/movedRecords'
import {
  hasRecords,
  myJoinedAt,
  personalCopy,
} from '@/app/sharedCars/personalCopy'
import type { EngineContext } from '@/app/sharedCars/engine/context'
import type { EngineParts, Endings } from '@/app/sharedCars/engine/parts'
import {
  type CarSyncOutcome,
  type SharedCarEnding,
  type SharedCarNotLeft,
  SharedCarsError,
} from '@/app/sharedCars/engine/types'
import type { SharedCar } from '@/types/sharedCars'

/**
 * How a car ends for the User (docs/shared-cars-protocol.md, "Leaving, removal,
 * rekeying, and stopping"): a personal copy goes into their own store from what
 * the car last synced, the personal records it was hiding are tombstoned
 * (moving in first any that were newer), the roster notes the leave, and the
 * car and its keys leave this device. The server hears after (`leave`, or the
 * owner's `delete`), retried until it has; joining the car again cancels one it
 * hasn't.
 */

export function createEndings(ctx: EngineContext, parts: EngineParts): Endings {
  const { deps, client, store, keyring } = ctx
  /**
   * When ends still owed were last tried after the roster: this launch, until
   * they are (device clock).
   */
  let endsTriedAt = deps.now()

  /**
   * The car ends for this User here. `leftAt` is the roster's time for it: the
   * synced clock's now, or another device's leave.
   */
  function endLocally(
    spaceId: string,
    reason: SharedCarEnding,
    leftAt = deps.syncNow()
  ) {
    const car = ctx.cars()[spaceId]
    ctx.engineWrite(() => {
      if (car) {
        // What an older build or an offline device left in the User's own
        // store for the car: the newer goes into the copy, and every version
        // the car was hiding is tombstoned, so none comes back beside it.
        const moved = movePersonalRecords(
          car,
          deps.personal.snapshot(),
          deps.stamp
        )
        const copy = personalCopy(moved.car, myJoinedAt(moved.car))
        copy.deletedMileageRecords = [
          ...copy.deletedMileageRecords,
          ...moved.tombstones,
        ]
        if (hasRecords(copy)) deps.personal.mergeRecords(copy)
      }
      const state = store.getState()
      const joined = state.memberships.cars[spaceId]?.at ?? 0
      state.noteLeft(spaceId, Math.max(leftAt, joined))
      state.removeSharedCar(spaceId)
      state.clearJoining(spaceId)
    })
    forgetCar(spaceId)
    // A car the roster brought that never synced here wasn't the User's yet.
    if (car && car.seq > 0) {
      deps.onOutcome?.({ type: 'ended', reason })
      deps.onCarEnded?.({
        spaceId,
        name: car.vehicles[0]?.name ?? '',
        reason,
      })
    }
  }

  /** Everything this device keeps about `spaceId` beside the car itself. */
  function forgetCar(spaceId: string) {
    keyring.forget(spaceId)
    ctx.forgetMember(spaceId)
    parts.keys.forget(spaceId)
    parts.sync.forget(spaceId)
    ctx.clearCarStatus(spaceId)
  }

  /**
   * Tells the server about an end this device already made: `leave`, or the
   * owner's `delete`. Retried until it lands; `gone` means it already has (a
   * leave whose answer was lost, or the last one to leave). Skipped once the
   * User is on the car again: sent now, it would take them off it. An owner's
   * `delete` refused because they're no longer the owner leaves instead.
   */
  async function finishEnd(spaceId: string): Promise<boolean> {
    const end = store.getState().pendingEnds[spaceId]
    if (!end) return true
    const clear = () =>
      ctx.engineWrite(() => store.getState().clearPendingEnd(spaceId))
    if (
      ctx.cars()[spaceId] ||
      isOnSharedCar(store.getState().memberships, spaceId)
    ) {
      clear()
      return true
    }
    const member = await ctx.memberFor(spaceId)
    try {
      if (end === 'delete')
        await client.deleteSpace(ctx.auth(member), ctx.call())
      else await client.leave(ctx.auth(member), ctx.call())
      ctx.noteAnswered()
    } catch (error) {
      ctx.rethrowReset(error)
      if (end === 'delete' && isSpaceError(error, 'forbidden')) {
        ctx.engineWrite(() => store.getState().setPendingEnd(spaceId, 'leave'))
        return finishEnd(spaceId)
      }
      if (isSpaceError(error, 'forbidden')) {
        // Not this member's token: nothing this device could send would land.
        ctx.report(error, end)
      } else if (
        !isSpaceError(error, 'gone') &&
        !isSpaceError(error, 'not_found')
      ) {
        ctx.noteFailure(error)
        ctx.report(error, end)
        return false
      }
    }
    clear()
    return true
  }

  /** Ends the car for this User and tells the server, which may wait. */
  async function endAndTell(
    spaceId: string,
    reason: SharedCarEnding,
    end: 'leave' | 'delete'
  ): Promise<{ pending: boolean }> {
    ctx.engineWrite(() => store.getState().setPendingEnd(spaceId, end))
    endLocally(spaceId, reason)
    return { pending: !(await finishEnd(spaceId)) }
  }

  /**
   * The car became the owner's own again: it has had someone else on it, and
   * now has no other member, no open invite, and no unexpired invite record (an
   * invitation a rekey closed that's still to be sent again, or one another of
   * the owner's devices is sending).
   */
  function isLastOneLeft(car: SharedCar): boolean {
    const me = car.myMemberId
    if (car.ownerId !== me || !car.hadOthers) return false
    if (car.spaceMembers.some((m) => m.memberId !== me)) return false
    if (car.spaceMembers.length === 0 || car.spaceInvites.length > 0)
      return false
    const now = deps.syncNow()
    return !car.inviteRecords.some((invite) => invite.expiresAt > now)
  }

  /**
   * Pulls and puts before a car ends here, so the copy has the newest and the
   * others have what changed here. Offline, the copy is as of the last sync.
   * False when the server says the car is gone (it ended already).
   */
  async function syncBeforeEnding(spaceId: string): Promise<boolean> {
    const member = await ctx.memberFor(spaceId)
    try {
      await parts.sync.pull(spaceId, member)
      parts.sync.movePersonal(spaceId)
      await parts.sync.push(spaceId, member)
    } catch (error) {
      ctx.rethrowReset(error)
      if (isSpaceError(error, 'gone')) {
        endLocally(spaceId, 'gone')
        return false
      }
      ctx.report(error, 'end')
    }
    return true
  }

  /**
   * Leaves a car: syncs what changed here, keeps a personal copy, and leaves
   * the space (the server hears now, or on a later sync). When the owner
   * leaves, whoever joined first takes the car over.
   */
  function leaveCar(spaceId: string): Promise<{ pending: boolean }> {
    return ctx.serial(spaceId, async () => {
      if (!ctx.cars()[spaceId]) throw new SharedCarsError('not_found')
      if (!(await syncBeforeEnding(spaceId))) return { pending: false }
      return endAndTell(spaceId, 'left', 'leave')
    })
  }

  /**
   * The owner stops sharing: syncs first, keeps their own copy, and deletes the
   * space. Everyone else gets `gone` and keeps a copy too.
   */
  function stopSharing(spaceId: string): Promise<{ pending: boolean }> {
    return ctx.serial(spaceId, async () => {
      const car = ctx.cars()[spaceId]
      if (!car) throw new SharedCarsError('not_found')
      const member = await ctx.memberFor(spaceId)
      if (car.ownerId !== member.memberId)
        throw new SharedCarsError('not_owner')
      if (!(await syncBeforeEnding(spaceId))) return { pending: false }
      return endAndTell(spaceId, 'stopped', 'delete')
    })
  }

  /**
   * The Buddies roster says another of the User's devices left a car
   * (`leftCars`): it ends here too, with the same personal copy that device
   * made, unless the User joined it again since.
   */
  function dropCarFromRoster(spaceId: string, leftAt: number): Promise<void> {
    ctx.engineWrite(() => store.getState().noteLeft(spaceId, leftAt))
    if (isOnSharedCar(store.getState().memberships, spaceId))
      return Promise.resolve()
    return ctx.serial(spaceId, async () => {
      if (ctx.cars()[spaceId]) endLocally(spaceId, 'left_elsewhere', leftAt)
    })
  }

  /**
   * Tells the server about every end this device already made. With
   * `afterRoster`, for the automatic syncs, only once the Buddies roster was
   * read since they were last tried (or since launch): another of the User's
   * devices may have joined a car again meanwhile, which the roster brings
   * (`isOnSharedCar`), and a leave sent before it would take them off it.
   */
  async function finishPendingEnds(
    options: { afterRoster?: boolean } = {}
  ): Promise<{ pending: number }> {
    const pending = () => Object.keys(store.getState().pendingEnds).length
    if (options.afterRoster && deps.rosterReadAt) {
      if (pending() === 0 || deps.rosterReadAt() <= endsTriedAt)
        return { pending: pending() }
      endsTriedAt = deps.now()
    }
    await Promise.all(
      Object.keys(store.getState().pendingEnds).map((spaceId) =>
        ctx
          .serial(spaceId, () => finishEnd(spaceId))
          .catch((error: unknown) => ctx.report(error, 'end'))
      )
    )
    return { pending: pending() }
  }

  /**
   * The roster's car on this device, to sync and leave: one the roster brought
   * that never got here (another device joined it, and this one was off).
   */
  function carFromRoster(spaceId: string, member: { memberId: string }) {
    if (ctx.cars()[spaceId]) return
    ctx.engineWrite(() =>
      store
        .getState()
        .saveSharedCar(emptySharedCar(spaceId, { myMemberId: member.memberId }))
    )
  }

  /**
   * Leaves every car the User is on, keeping a copy of each: the ones here, the
   * ones this device knows only from the roster, and joins whose answer was
   * lost. Shares still seeding are dropped first. For Delete My Buddies Data
   * (before the seed goes, since it's what proves membership) and Delete All
   * Mileage. `notLeft` names the cars the server hasn't heard leave yet;
   * they're retried on later syncs while the seed lasts, and `pending` counts
   * them.
   */
  async function leaveAll(): Promise<{
    pending: number
    notLeft: SharedCarNotLeft[]
  }> {
    await parts.sharing.abandonShares()
    await parts.invites.confirmJoins()
    const names = new Map<string, string>()
    const { memberships } = store.getState()
    await Promise.all(
      activeSharedCarIds(memberships)
        .filter((spaceId) => !ctx.cars()[spaceId])
        .map((spaceId) =>
          ctx
            .serial(spaceId, async () =>
              carFromRoster(spaceId, await ctx.memberFor(spaceId))
            )
            .catch((error: unknown) => ctx.report(error, 'leave'))
        )
    )
    for (const [spaceId, car] of Object.entries(ctx.cars()))
      names.set(spaceId, car.vehicles[0]?.name ?? '')
    await Promise.all(
      Object.keys(ctx.cars()).map((spaceId) =>
        leaveCar(spaceId).catch((error: unknown) => ctx.report(error, 'leave'))
      )
    )
    await finishPendingEnds()
    const state = store.getState()
    const still = new Set([
      ...Object.keys(state.cars),
      ...Object.keys(state.pendingEnds),
      ...Object.keys(state.joining),
    ])
    const notLeft = [...still].map((spaceId) => ({
      spaceId,
      name: names.get(spaceId) ?? '',
    }))
    return { pending: notLeft.length, notLeft }
  }

  /**
   * The owner removes someone, named or not yet (`unnamedMembers`); the key
   * changes right after.
   */
  function removeMember(
    spaceId: string,
    memberId: string
  ): Promise<CarSyncOutcome> {
    return ctx.serial(spaceId, async () => {
      const car = ctx.cars()[spaceId]
      if (!car) throw new SharedCarsError('not_found')
      const member = await ctx.memberFor(spaceId)
      if (car.ownerId !== member.memberId)
        throw new SharedCarsError('not_owner')
      if (memberId === member.memberId || !SPACE_ID_PATTERN.test(memberId))
        throw new SharedCarsError('not_found')
      try {
        await client.removeMember(ctx.auth(member), memberId, ctx.call())
      } catch (error) {
        if (isSpaceError(error, 'gone')) {
          endLocally(spaceId, 'gone')
          return 'ended'
        }
        throw error
      }
      ctx.noteAnswered()
      return parts.sync.runSteps(spaceId, member)
    })
  }

  return {
    endLocally,
    finishEnd,
    endAndTell,
    isLastOneLeft,
    leaveCar,
    stopSharing,
    removeMember,
    dropCarFromRoster,
    finishPendingEnds,
    leaveAll,
  }
}
