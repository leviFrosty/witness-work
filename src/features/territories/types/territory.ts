import type { Coordinate } from '@/types/contact'

export type DoorOutcome = 'notHome' | 'spoke' | 'doNotCall'

export type TerritoryPerson = {
  id: string
  name: string
  kind: 'buddy' | 'guest'

  inboxId?: string

  shareId?: string

  addedAt?: number

  tag?: string
}

export type CoordinateSource = 'gps' | 'manual'

export type TerritoryDoor = {
  id: string

  label: string
  outcome: DoorOutcome
  at: number

  tries: number

  coordinate?: Coordinate

  coordinateSource?: CoordinateSource

  description?: string

  by?: string
}

export type StreetNumbering = 'both' | 'odd' | 'even' | 'none'

export type TerritoryStreet = {
  id: string
  name: string
  numbering: StreetNumbering

  next: number

  first?: number
  descending?: boolean

  houses?: string[]
  doors: TerritoryDoor[]

  workedAt?: number

  saveLocations?: boolean

  handoff?: TerritoryHandoff

  workedBy?: string
}

export type TerritoryHandoff = {
  personId: string
  at: number

  pending?: boolean
}

export type TerritoryShare = {
  id: string
  kind: 'person' | 'link'

  personId?: string

  streetIds?: string[]
  createdAt: number
  expiresAt?: number
  endedAt?: number

  pending?: boolean

  by?: string
}

export type TerritoryReceived = {
  kind: 'shared' | 'handoff'
  from: TerritoryPerson
  at: number

  territoryId?: string

  streetIds?: string[]

  endedAt?: number
}

export type TerritoryDoNotCall = {
  id: string
  address: string
  at: number

  coordinate?: Coordinate

  streetId?: string

  label?: string
}

export type Territory = {
  id: string
  number: string
  name?: string
  link?: string
  coordinate?: Coordinate

  photo?: string
  checkedOutAt: number

  returnBy?: number
  finishedAt?: number
  streets: TerritoryStreet[]
  doNotCalls: TerritoryDoNotCall[]
  createdAt: number

  outline?: Coordinate[]

  people?: TerritoryPerson[]
  shares?: TerritoryShare[]

  received?: TerritoryReceived

  shared?: TerritorySharedState
}

export type TerritoryRole = 'owner' | 'whole' | 'street' | 'onward'

export type TerritorySharedState = {
  spaceId: string

  me: string
  role: TerritoryRole

  holds: string[]

  houseRecords: boolean
}
