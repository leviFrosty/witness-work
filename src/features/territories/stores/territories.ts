import { create, type StateCreator } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { syncTimestamp } from '@/lib/syncClock'
import { persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import { clearDoorRecords } from '@/features/territories/lib/doors'
import { diffTerritory } from '@/features/territories/lib/shared/diff'
import { migrateTerritories } from '@/features/territories/lib/shared/migration'
import {
  type HeldTerritories,
  isDeleted,
  type PersonalLedger,
  personalTerritories,
  restampLedger,
} from '@/features/territories/lib/personalSync'
import {
  type BuddyNameResolver,
  myRole,
  projectSpace,
} from '@/features/territories/lib/shared/projection'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import type {
  TerritoryJoining,
  TerritoryMemberships,
  TerritorySeeding,
  TerritorySpace,
} from '@/features/territories/types/sharedTerritory'
import type { Territory } from '@/features/territories/types/territory'

export type PendingEnd = 'leave' | 'delete'

export type TerritoriesState = {
  territories: Territory[]
  spaces: Record<string, TerritorySpace>
  seeding: Record<string, TerritorySeeding>
  joining: Record<string, TerritoryJoining>
  pendingEnds: Record<string, PendingEnd>
  closingInvites: Record<string, Record<string, true>>
  memberships: TerritoryMemberships
  ledger: PersonalLedger
  save: (territory: Territory) => void
  update: (id: string, change: (territory: Territory) => Territory) => void
  remove: (id: string) => void
  saveSpace: (space: TerritorySpace, replaces?: string) => void
  updateSpace: (
    spaceId: string,
    change: (space: TerritorySpace) => TerritorySpace
  ) => void
  removeSpace: (spaceId: string, keep?: Territory) => void
  setHouseRecords: (spaceId: string, on: boolean) => void
  reproject: () => void
  saveSeeding: (seeding: TerritorySeeding) => void
  clearSeeding: (spaceId: string) => void
  saveJoining: (joining: TerritoryJoining) => void
  clearJoining: (spaceId: string) => void
  setPendingEnd: (spaceId: string, end: PendingEnd) => void
  clearPendingEnd: (spaceId: string) => void
  addClosingInvite: (spaceId: string, inviteId: string) => void
  clearClosingInvite: (spaceId: string, inviteId: string) => void
  noteJoined: (spaceId: string, at: number) => void
  noteLeft: (spaceId: string, at: number) => void
  stampLedger: () => void
  reset: () => void
}

let buddyByTag: BuddyNameResolver | undefined

let privacyOn = () => false

const project = (space: TerritorySpace) =>
  projectSpace(space, { privacy: privacyOn(), buddyByTag })

const myName = (space: TerritorySpace) => {
  const name = space.records[`m.${space.myMemberId}`]?.data?.name
  return typeof name === 'string' ? name : space.writtenName
}

const houseRecordsFor = (space: TerritorySpace) =>
  myRole(space) === 'owner'
    ? !privacyOn()
    : space.records.h?.data?.houseRecords !== false

export function withPending(
  pending: readonly string[],
  ids: Iterable<string>
): string[] {
  const held = new Set(pending)
  const added = [...ids].filter((id) => !held.has(id) && held.add(id))
  return added.length > 0 ? [...pending, ...added] : (pending as string[])
}

function placeView(
  territories: Territory[],
  view: Territory,
  replaces?: string
): Territory[] {
  const ownCopy = (territory: Territory) =>
    view.shared?.role === 'owner' &&
    territory.shared === undefined &&
    territory.received === undefined &&
    territory.id === view.id
  const replaced = (territory: Territory) =>
    territory.shared?.spaceId === view.shared?.spaceId ||
    territory.id === replaces ||
    ownCopy(territory)
  const at = territories.findIndex(replaced)
  if (at === -1) return [...territories, view]
  const next = [...territories]
  next[at] = view
  return next.filter((territory, index) => index === at || !replaced(territory))
}

export function heldTerritories(
  state: Pick<TerritoriesState, 'territories' | 'spaces' | 'memberships'>
): HeldTerritories {
  const held = new Map<string, number | undefined>()
  for (const territory of state.territories) {
    if (!territory.shared) continue
    const { spaceId } = territory.shared
    const space = state.spaces?.[spaceId]
    const created = space?.members.find(
      (member) => member.memberId === space.ownerId
    )?.joinedAt
    held.set(
      territory.id,
      created ?? state.memberships?.territories?.[spaceId]?.at
    )
  }
  return held
}

function stampedLedger(
  state: TerritoriesState,
  only?: ReadonlySet<string>
): PersonalLedger {
  const held = heldTerritories(state)
  return restampLedger(
    state.ledger,
    personalTerritories(state.territories, held),
    held,
    syncTimestamp,
    only
  )
}

function changedTerritories(
  state: TerritoriesState,
  previous: TerritoriesState
): Set<string> {
  const changed = new Set<string>()
  const before = new Map(previous.territories.map((t) => [t.id, t]))
  for (const territory of state.territories) {
    if (before.get(territory.id) !== territory) changed.add(territory.id)
    before.delete(territory.id)
  }
  for (const id of before.keys()) changed.add(id)
  if (
    state.spaces !== previous.spaces ||
    state.memberships !== previous.memberships
  ) {
    const now = heldTerritories(state)
    const was = heldTerritories(previous)
    for (const [id, since] of now)
      if (!was.has(id) || was.get(id) !== since) changed.add(id)
    for (const id of was.keys()) if (!now.has(id)) changed.add(id)
  }
  return changed
}

export function applyTerritoryChange(
  space: TerritorySpace,
  before: Territory,
  after: Territory,
  houseRecords = houseRecordsFor(space)
): TerritorySpace {
  const changes = diffTerritory(before, after, space, {
    me: space.myMemberId,
    myName: myName(space),
    houseRecords,
    stamp: syncTimestamp,
  })
  const ids = Object.keys(changes.records)
  return {
    ...space,
    records:
      ids.length > 0 ? { ...space.records, ...changes.records } : space.records,
    pending: withPending(space.pending, ids),
    local: changes.local,
  }
}

const EMPTY_MEMBERSHIPS: TerritoryMemberships = {
  territories: {},
  leftTerritories: {},
}

const without = <T>(record: Record<string, T>, key: string) => {
  if (!(key in record)) return record
  const { [key]: _removed, ...rest } = record
  return rest
}

export const territoriesState: StateCreator<TerritoriesState> = (set) => {
  const withSpace = (
    state: TerritoriesState,
    space: TerritorySpace,
    replaces?: string
  ) => ({
    spaces: { ...state.spaces, [space.spaceId]: space },
    territories: placeView(state.territories, project(space), replaces),
  })
  return {
    territories: [],
    spaces: {},
    seeding: {},
    joining: {},
    pendingEnds: {},
    closingInvites: {},
    memberships: EMPTY_MEMBERSHIPS,
    ledger: {},
    save: (territory) =>
      set((state) => {
        const before = state.territories.find((t) => t.id === territory.id)
        const space = before?.shared && state.spaces[before.shared.spaceId]
        if (before && space)
          return withSpace(
            state,
            applyTerritoryChange(space, before, {
              ...territory,
              shared: before.shared,
            })
          )
        return {
          territories: before
            ? state.territories.map((t) =>
                t.id === territory.id ? territory : t
              )
            : [...state.territories, territory],
        }
      }),
    update: (id, change) =>
      set((state) => {
        const before = state.territories.find((t) => t.id === id)
        if (!before) return state
        const space = before.shared && state.spaces[before.shared.spaceId]
        if (!space)
          return {
            territories: state.territories.map((t) =>
              t.id === id ? change(t) : t
            ),
          }
        return withSpace(
          state,
          applyTerritoryChange(space, before, change(before))
        )
      }),
    remove: (id) =>
      set((state) => ({
        territories: state.territories.filter(
          (t) => t.id !== id || t.shared !== undefined
        ),
      })),
    saveSpace: (space, replaces) =>
      set((state) => withSpace(state, space, replaces)),
    updateSpace: (spaceId, change) =>
      set((state) => {
        const space = state.spaces?.[spaceId]
        if (!space) return state
        const next = change(space)
        return next === space ? state : withSpace(state, next)
      }),
    removeSpace: (spaceId, keep) =>
      set((state) => {
        if (!state.spaces[spaceId]) return state
        const kept = keep && !isDeleted(state.ledger[keep.id]) ? keep : null
        const at = state.territories.findIndex(
          (t) => t.shared?.spaceId === spaceId
        )
        const territories = state.territories.filter(
          (t) => t.shared?.spaceId !== spaceId && t.id !== keep?.id
        )
        if (kept)
          territories.splice(at === -1 ? territories.length : at, 0, kept)
        return { spaces: without(state.spaces, spaceId), territories }
      }),
    setHouseRecords: (spaceId, on) =>
      set((state) => {
        const space = state.spaces?.[spaceId]
        if (!space) return state
        const all = projectSpace(space, {
          privacy: false,
          showAllDoors: true,
        })
        return withSpace(
          state,
          applyTerritoryChange(
            space,
            all,
            on ? all : clearDoorRecords(all, formatDoorAddress),
            on
          )
        )
      }),
    reproject: () =>
      set((state) => {
        let territories = state.territories
        for (const space of Object.values(state.spaces))
          territories = placeView(territories, project(space))
        return { territories }
      }),
    saveSeeding: (seeding) =>
      set((state) => ({
        seeding: { ...state.seeding, [seeding.spaceId]: seeding },
      })),
    clearSeeding: (spaceId) =>
      set((state) => ({ seeding: without(state.seeding, spaceId) })),
    saveJoining: (joining) =>
      set((state) => ({
        joining: { ...state.joining, [joining.spaceId]: joining },
      })),
    clearJoining: (spaceId) =>
      set((state) => ({ joining: without(state.joining, spaceId) })),
    setPendingEnd: (spaceId, end) =>
      set((state) => ({
        pendingEnds: { ...state.pendingEnds, [spaceId]: end },
      })),
    clearPendingEnd: (spaceId) =>
      set((state) => ({
        pendingEnds: without(state.pendingEnds, spaceId),
      })),
    addClosingInvite: (spaceId, inviteId) =>
      set((state) => ({
        closingInvites: {
          ...state.closingInvites,
          [spaceId]: {
            ...state.closingInvites[spaceId],
            [inviteId]: true,
          },
        },
      })),
    clearClosingInvite: (spaceId, inviteId) =>
      set((state) => {
        const left = without(state.closingInvites[spaceId] ?? {}, inviteId)
        return {
          closingInvites:
            Object.keys(left).length > 0
              ? { ...state.closingInvites, [spaceId]: left }
              : without(state.closingInvites, spaceId),
        }
      }),
    noteJoined: (spaceId, at) =>
      set((state) => {
        const had = state.memberships.territories[spaceId]?.at
        if (had !== undefined && had >= at) return state
        return {
          memberships: {
            ...state.memberships,
            territories: {
              ...state.memberships.territories,
              [spaceId]: { at },
            },
          },
        }
      }),
    noteLeft: (spaceId, at) =>
      set((state) => {
        const had = state.memberships.leftTerritories[spaceId]
        if (had !== undefined && had >= at) return state
        return {
          memberships: {
            ...state.memberships,
            leftTerritories: {
              ...state.memberships.leftTerritories,
              [spaceId]: at,
            },
          },
        }
      }),
    stampLedger: () =>
      set((state) => {
        const ledger = stampedLedger(state)
        return ledger === state.ledger ? state : { ledger }
      }),
    reset: () =>
      set((state) => ({
        territories: state.territories.filter((t) => !t.shared),
        spaces: {},
        seeding: {},
        joining: {},
        pendingEnds: {},
        closingInvites: {},
        memberships: EMPTY_MEMBERSHIPS,
      })),
  }
}

export const useTerritories = create<TerritoriesState>()(
  persist((...args) => territoriesState(...args), {
    name: 'territories',
    version: 2,
    migrate: (persisted, version) =>
      migrateTerritories(persisted, version) as never,
    storage: createJSONStorage(() => MmkvStorage),
    partialize: ({
      territories,
      spaces,
      seeding,
      joining,
      pendingEnds,
      closingInvites,
      memberships,
      ledger,
    }) => ({
      territories: Array.isArray(territories)
        ? territories.filter((territory) => !territory.shared)
        : territories,
      spaces,
      seeding,
      joining,
      pendingEnds,
      closingInvites,
      memberships,
      ledger,
    }),
    merge: (persisted, current) => {
      const saved = (persisted ?? {}) as Partial<TerritoriesState>
      const spaces = saved.spaces ?? {}
      let territories = (saved.territories ?? current.territories).filter(
        (territory) => !territory.shared
      )
      for (const space of Object.values(spaces))
        territories = placeView(territories, project(space), space.territoryId)
      return {
        ...current,
        ...saved,
        memberships: saved.memberships ?? EMPTY_MEMBERSHIPS,
        ledger: saved.ledger ?? {},
        spaces,
        territories,
      }
    },
  })
)

useTerritories.subscribe((state, previous) => {
  if (
    !Array.isArray(state.territories) ||
    !Array.isArray(previous.territories) ||
    typeof state.ledger !== 'object' ||
    state.ledger === null
  )
    return
  if (
    state.territories === previous.territories &&
    state.spaces === previous.spaces &&
    state.memberships === previous.memberships
  )
    return
  const only = changedTerritories(state, previous)
  if (only.size === 0) return
  const ledger = stampedLedger(state, only)
  if (ledger !== state.ledger) useTerritories.setState({ ledger })
})

export function configureTerritoryViews(options: {
  privacy: () => boolean
  buddyByTag?: BuddyNameResolver
}) {
  privacyOn = options.privacy
  buddyByTag = options.buddyByTag
  useTerritories.getState().reproject()
}

export const useTerritory = (id: string | undefined) =>
  useTerritories((state) =>
    id ? state.territories.find((territory) => territory.id === id) : undefined
  )

export const spaceOfTerritory = (id: string): TerritorySpace | undefined => {
  const { territories, spaces } = useTerritories.getState()
  const spaceId = territories.find((t) => t.id === id)?.shared?.spaceId
  return spaceId ? spaces[spaceId] : undefined
}
