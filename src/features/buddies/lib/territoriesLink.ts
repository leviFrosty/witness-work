import type {
  BuddiesTerritoriesDeps,
  TerritoryMembershipsRoster,
} from '@/features/buddies/lib/engine'

function mergeMemberships(
  a: TerritoryMembershipsRoster,
  b: TerritoryMembershipsRoster
): TerritoryMembershipsRoster {
  const territories = { ...a.territories }
  for (const [spaceId, { at }] of Object.entries(b.territories))
    if (!territories[spaceId] || territories[spaceId].at < at)
      territories[spaceId] = { at }
  const leftTerritories = { ...a.leftTerritories }
  for (const [spaceId, at] of Object.entries(b.leftTerritories))
    leftTerritories[spaceId] = Math.max(leftTerritories[spaceId] ?? 0, at)
  return { territories, leftTerritories }
}

export function createBuddiesTerritoriesLink() {
  let handler: BuddiesTerritoriesDeps | null = null
  let waiting: TerritoryMembershipsRoster = {
    territories: {},
    leftTerritories: {},
  }

  const deps: BuddiesTerritoriesDeps = {
    memberships: () => (handler ? handler.memberships() : waiting),
    mergeMemberships: (remote) => {
      if (handler) handler.mergeMemberships(remote)
      else waiting = mergeMemberships(waiting, remote)
    },
    openInvitesTo: (inboxId) => handler?.openInvitesTo(inboxId) ?? [],
    replyApplies: (reply) => handler?.replyApplies(reply) ?? false,
    isOnCar: (spaceId) => handler?.isOnCar?.(spaceId) ?? false,
    inviteOpen: (spaceId, inviteId) =>
      handler?.inviteOpen?.(spaceId, inviteId) ?? true,
    onEvent: (notice) => handler?.onEvent?.(notice),
    onInviteLost: (invite) => handler?.onInviteLost?.(invite),
    onBuddyGone: (inboxId) => handler?.onBuddyGone?.(inboxId),
    leaveAll: async () =>
      handler?.leaveAll ? handler.leaveAll() : { pending: 0 },
    finishPending: async () =>
      handler?.finishPending ? handler.finishPending() : { pending: 0 },
    forgetLocal: () => handler?.forgetLocal?.(),
  }

  return {
    deps,

    setHandler(next: BuddiesTerritoriesDeps | null) {
      handler = next
      const remote = waiting
      waiting = { territories: {}, leftTerritories: {} }
      if (
        next &&
        (Object.keys(remote.territories).length > 0 ||
          Object.keys(remote.leftTerritories).length > 0)
      )
        next.mergeMemberships(remote)
    },
  }
}
