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

export function createEndings(ctx: EngineContext, parts: EngineParts): Endings {
  const { deps, client, store, keyring } = ctx

  let endsTriedAt = deps.now()

  function endLocally(
    spaceId: string,
    reason: SharedCarEnding,
    leftAt = deps.syncNow()
  ) {
    const car = ctx.cars()[spaceId]
    ctx.engineWrite(() => {
      if (car) {
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

    if (car && car.seq > 0) {
      deps.onOutcome?.({ type: 'ended', reason })
      deps.onCarEnded?.({
        spaceId,
        name: car.vehicles[0]?.name ?? '',
        reason,
      })
    }
  }

  function forgetCar(spaceId: string) {
    keyring.forget(spaceId)
    ctx.forgetMember(spaceId)
    parts.keys.forget(spaceId)
    parts.sync.forget(spaceId)
    ctx.clearCarStatus(spaceId)
  }

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

  async function endAndTell(
    spaceId: string,
    reason: SharedCarEnding,
    end: 'leave' | 'delete'
  ): Promise<{ pending: boolean }> {
    ctx.engineWrite(() => store.getState().setPendingEnd(spaceId, end))
    endLocally(spaceId, reason)
    return { pending: !(await finishEnd(spaceId)) }
  }

  function isLastOneLeft(car: SharedCar): boolean {
    const me = car.myMemberId
    if (car.ownerId !== me || !car.hadOthers) return false
    if (car.spaceMembers.some((m) => m.memberId !== me)) return false
    if (car.spaceMembers.length === 0 || car.spaceInvites.length > 0)
      return false
    const now = deps.syncNow()
    return !car.inviteRecords.some((invite) => invite.expiresAt > now)
  }

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

  function leaveCar(spaceId: string): Promise<{ pending: boolean }> {
    return ctx.serial(spaceId, async () => {
      if (!ctx.cars()[spaceId]) throw new SharedCarsError('not_found')
      if (!(await syncBeforeEnding(spaceId))) return { pending: false }
      return endAndTell(spaceId, 'left', 'leave')
    })
  }

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

  function dropCarFromRoster(spaceId: string, leftAt: number): Promise<void> {
    ctx.engineWrite(() => store.getState().noteLeft(spaceId, leftAt))
    if (isOnSharedCar(store.getState().memberships, spaceId))
      return Promise.resolve()
    return ctx.serial(spaceId, async () => {
      if (ctx.cars()[spaceId]) endLocally(spaceId, 'left_elsewhere', leftAt)
    })
  }

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

  function carFromRoster(spaceId: string, member: { memberId: string }) {
    if (ctx.cars()[spaceId]) return
    ctx.engineWrite(() =>
      store
        .getState()
        .saveSharedCar(emptySharedCar(spaceId, { myMemberId: member.memberId }))
    )
  }

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
