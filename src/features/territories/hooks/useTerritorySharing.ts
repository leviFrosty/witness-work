import { createContext, useContext } from 'react'
import type { ProfileAvatar } from '@/types/avatar'

export type TerritoryBuddy = {
  inboxId: string
  name: string
  avatar: ProfileAvatar
  color?: string
}

export type TerritorySharingActions = {
  share: (
    territoryId: string,
    inboxIds: readonly string[],
    streetIds?: readonly string[]
  ) => Promise<boolean>
  stopSharing: (territoryId: string, personId: string) => Promise<boolean>
  handOff: (
    territoryId: string,
    streetId: string,
    inboxId: string
  ) => Promise<boolean>
  endHandoff: (territoryId: string, streetId: string) => Promise<boolean>
  createLink: (
    territoryId: string,
    streetIds?: readonly string[]
  ) => Promise<{ linkId: string; url: string } | null>
  linkUrl: (territoryId: string, linkId: string) => Promise<string | null>
  endLink: (territoryId: string, linkId: string) => Promise<boolean>
  leave: (territoryId: string) => Promise<boolean>
  returnTerritory: (territoryId: string) => Promise<boolean>
  refresh: (territoryId: string) => Promise<void>
}

export type TerritorySharing = {
  buddiesAvailable: boolean

  buddies: readonly TerritoryBuddy[]

  ownName: string

  canOpenBuddies: boolean

  actions: TerritorySharingActions
}

const unavailable = async () => false

export const NO_TERRITORY_SHARING: TerritorySharing = {
  buddiesAvailable: false,
  buddies: [],
  ownName: '',
  canOpenBuddies: false,
  actions: {
    share: unavailable,
    stopSharing: unavailable,
    handOff: unavailable,
    endHandoff: unavailable,
    createLink: async () => null,
    linkUrl: async () => null,
    endLink: unavailable,
    leave: unavailable,
    returnTerritory: unavailable,
    refresh: async () => {},
  },
}

export const TerritorySharingContext =
  createContext<TerritorySharing>(NO_TERRITORY_SHARING)

export default function useTerritorySharing(): TerritorySharing {
  return useContext(TerritorySharingContext)
}
