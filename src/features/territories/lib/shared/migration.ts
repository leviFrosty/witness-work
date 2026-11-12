import { sha256 } from '@noble/hashes/sha2.js'
import { utf8 } from '@/lib/bytes'
import { uuidFromHash } from '@/lib/sharedSpaces/crypto'
import { UUID_PATTERN } from '@/lib/sharedSpaces/scopes'
import type {
  Territory,
  TerritoryDoNotCall,
  TerritoryDoor,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const freshId = (territoryId: string, id: string) =>
  uuidFromHash(sha256(utf8(`ww-territories/v2/id|${territoryId}|${id}`)))

const idFor = (territoryId: string, id: string) => {
  const lower = id.toLowerCase()
  return UUID_PATTERN.test(lower) ? lower : freshId(territoryId, id)
}

function cleanDoor(territoryId: string, door: TerritoryDoor): TerritoryDoor {
  const { by: _by, ...rest } = door
  return { ...rest, id: idFor(territoryId, door.id) }
}

function cleanStreet(
  territoryId: string,
  street: TerritoryStreet
): TerritoryStreet {
  const { handoff: _handoff, workedBy: _workedBy, ...rest } = street
  return {
    ...rest,
    id: idFor(territoryId, street.id),
    doors: street.doors.map((door) => cleanDoor(territoryId, door)),
  }
}

function cleanDoNotCall(
  territoryId: string,
  entry: TerritoryDoNotCall,
  streets: Map<string, string>
): TerritoryDoNotCall {
  const { streetId, ...rest } = entry
  const moved = streetId === undefined ? undefined : streets.get(streetId)
  return {
    ...rest,
    id: idFor(territoryId, entry.id),
    ...(moved !== undefined && { streetId: moved }),
  }
}

export function cleanPrototypeTerritory(territory: Territory): Territory {
  const {
    people: _people,
    shares: _shares,
    received: _received,
    shared: _shared,
    ...rest
  } = territory
  const streets = territory.streets.map((street) =>
    cleanStreet(territory.id, street)
  )
  const ids = new Map(
    territory.streets.map((street, index) => [
      street.id,
      streets[index]?.id ?? street.id,
    ])
  )
  return {
    ...rest,
    streets,
    doNotCalls: territory.doNotCalls.map((entry) =>
      cleanDoNotCall(territory.id, entry, ids)
    ),
  }
}

export function migrateTerritories(
  persisted: unknown,
  version: number
): unknown {
  const state = (persisted ?? {}) as { territories?: Territory[] }
  if (version >= 2) return state
  return {
    ...state,
    territories: (state.territories ?? [])
      .filter((territory) => !territory.received)
      .map(cleanPrototypeTerritory),
  }
}
