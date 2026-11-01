import {
  activeSharedCarIds,
  carReplyApplies,
  isOnSharedCar,
  mergeSharedCarMemberships,
  openCarInvites,
  openInvitesTo,
} from '@/lib/mileage/sharedCar'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import type { SharedCarsState, SharedCarsStore } from '@/stores/sharedCars'
import type { SharedCarMemberships } from '@/types/sharedCars'
import type { BuddiesCarsDeps } from '@/features/buddies/lib/engine'

export type BuddiesCarsHandler = Pick<
  BuddiesCarsDeps,
  | 'mergeMemberships'
  | 'onEvent'
  | 'onBuddyGone'
  | 'onInviteLost'
  | 'leaveAll'
  | 'finishPending'
  | 'forgetLocal'
>

export function rosterMembershipChanges(
  local: SharedCarMemberships,
  remote: SharedCarMemberships
): {
  joined: { spaceId: string; at: number }[]
  left: { spaceId: string; at: number; ends: boolean }[]
} {
  const merged = mergeSharedCarMemberships(local, remote)
  return {
    joined: Object.entries(remote.cars)
      .filter(
        ([spaceId, { at }]) =>
          (local.cars[spaceId]?.at ?? -Infinity) < at &&
          isOnSharedCar(merged, spaceId)
      )
      .map(([spaceId, { at }]) => ({ spaceId, at })),
    left: Object.entries(remote.leftCars)
      .filter(([spaceId, at]) => (local.leftCars[spaceId] ?? -Infinity) < at)
      .map(([spaceId, at]) => ({
        spaceId,
        at,
        ends: !isOnSharedCar(merged, spaceId),
      })),
  }
}

export function noteRosterMemberships(
  store: Pick<SharedCarsStore, 'getState'>,
  remote: SharedCarMemberships
) {
  const state = store.getState()
  const { joined, left } = rosterMembershipChanges(state.memberships, remote)
  for (const { spaceId, at } of joined) state.noteJoined(spaceId, at)
  for (const { spaceId, at } of left) state.noteLeft(spaceId, at)
}

function carsHeld(state: SharedCarsState) {
  const spaceIds = new Set([
    ...Object.keys(state.cars),
    ...activeSharedCarIds(state.memberships),
    ...Object.keys(state.pendingEnds),
    ...Object.keys(state.joining),
  ])
  return [...spaceIds].map((spaceId) => ({
    spaceId,
    name: state.cars[spaceId]?.vehicles[0]?.name ?? '',
  }))
}

export function pendingInviteCloses(
  state: Pick<SharedCarsState, 'cars' | 'closingInvites'>
) {
  return Object.entries(state.closingInvites)
    .filter(([spaceId]) => state.cars[spaceId])
    .reduce((count, [, closing]) => count + Object.keys(closing).length, 0)
}

export function createBuddiesCarsLink(
  store: Pick<SharedCarsStore, 'getState'>,
  {
    now,
    forgetKeys,
  }: {
    now: () => number

    forgetKeys?: () => void
  }
) {
  let handler: BuddiesCarsHandler | null = null

  const deps: BuddiesCarsDeps = {
    memberships: () => store.getState().memberships,

    mergeMemberships: (remote) =>
      handler
        ? handler.mergeMemberships(remote)
        : noteRosterMemberships(store, remote),
    openInvitesTo: (inboxId) =>
      openInvitesTo(
        store.getState().cars,
        (spaceId) => memberTag(spaceId, inboxId),
        now()
      ),
    replyApplies: ({ from, spaceId, inviteId }) =>
      carReplyApplies(
        store.getState(),
        spaceId,
        inviteId,
        memberTag(spaceId, from)
      ),
    isOnCar: (spaceId) => {
      const state = store.getState()
      return (
        state.cars[spaceId] !== undefined ||
        isOnSharedCar(state.memberships, spaceId)
      )
    },
    inviteOpen: (spaceId, inviteId) => {
      const state = store.getState()
      const car = state.cars[spaceId]
      return (
        car !== undefined &&
        !state.closingInvites[spaceId]?.[inviteId] &&
        openCarInvites(car, now()).some(
          (invite) => invite.inviteId === inviteId
        )
      )
    },
    onEvent: (notice) => handler?.onEvent?.(notice),
    onBuddyGone: (inboxId) => handler?.onBuddyGone?.(inboxId),

    onInviteLost: (invite) => {
      store.getState().oweInvite(invite.spaceId, invite.inviteId)
      handler?.onInviteLost?.(invite)
    },

    leaveAll: async () => {
      if (handler?.leaveAll) return handler.leaveAll()
      const notLeft = carsHeld(store.getState())
      return { pending: notLeft.length, notLeft }
    },
    finishPending: async () => {
      if (handler?.finishPending) return handler.finishPending()
      const state = store.getState()
      return {
        pending:
          Object.keys(state.pendingEnds).length + pendingInviteCloses(state),
      }
    },
    forgetLocal: () => {
      if (handler?.forgetLocal) return handler.forgetLocal()
      store.getState().reset()
      forgetKeys?.()
    },
  }

  return {
    deps,

    setHandler: (next: BuddiesCarsHandler | null) => {
      handler = next
    },
  }
}
