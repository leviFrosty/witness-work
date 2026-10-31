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

/**
 * What a Buddies engine knows of Shared Cars. Buddies carries their invitations
 * (`car.*` events) and the cars the User is on (the roster); the Shared Cars
 * engine, which lives in the app, acts on them through the handler it sets
 * (`setHandler`). The cars themselves are read from their store.
 */
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

/**
 * What another device's memberships (the roster's `cars` and `leftCars`) change
 * on this one, by the roster's rule over both: each entry only when it's newer
 * than this device's own. `joined` are the cars that leaves the User on;
 * `left`, the cars they left, each `ends` when the User isn't on it any more
 * (and not when they joined it again since).
 */
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

/**
 * Notes another device's memberships on this one without acting on any car: for
 * while Shared Cars doesn't run here. The roster still carries them, and the
 * Shared Cars runtime picks the cars up when it starts.
 */
export function noteRosterMemberships(
  store: Pick<SharedCarsStore, 'getState'>,
  remote: SharedCarMemberships
) {
  const state = store.getState()
  const { joined, left } = rosterMembershipChanges(state.memberships, remote)
  for (const { spaceId, at } of joined) state.noteJoined(spaceId, at)
  for (const { spaceId, at } of left) state.noteLeft(spaceId, at)
}

/**
 * Every car the User may still be on here, for leaving them all: the cars on
 * this device, the ones the roster says they're on, leaves the server hasn't
 * heard, and joins whose answer hasn't come. Named as they last synced.
 */
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

/**
 * How many invitations the cars on this device are still closing
 * (`closingInvites`) that the server hasn't heard.
 */
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
    /** Forgets every car's key on the device, with its cars. */
    forgetKeys?: () => void
  }
) {
  let handler: BuddiesCarsHandler | null = null

  const deps: BuddiesCarsDeps = {
    memberships: () => store.getState().memberships,
    // Before the app sets its handler, another device's memberships are only
    // noted, so the roster still carries them.
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
    // Its car owes it again, record kept, even before Shared Cars runs here,
    // so a later sync sends it under a new id until one goes.
    onInviteLost: (invite) => {
      store.getState().oweInvite(invite.spaceId, invite.inviteId)
      handler?.onInviteLost?.(invite)
    },
    // Without the Shared Cars engine nothing can leave a car, so every car the
    // User may be on counts: the seed that proves membership mustn't go.
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
    /** The Shared Cars engine's side of `car.*` events and memberships. */
    setHandler: (next: BuddiesCarsHandler | null) => {
      handler = next
    },
  }
}
