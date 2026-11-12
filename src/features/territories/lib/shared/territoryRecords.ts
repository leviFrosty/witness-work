import { clip } from '@/lib/sharedSpaces/records'
import { isUuid } from '@/lib/sharedSpaces/scopes'
import type { Coordinate } from '@/types/contact'
import type {
  CoordinateSource,
  DoorOutcome,
  StreetNumbering,
  Territory,
  TerritoryDoNotCall,
  TerritoryDoor,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export const TERRITORY_LIMITS = {
  number: 20,
  name: 80,
  link: 2000,
  outlinePoints: 200,
  streetName: 80,
  doorLabel: 40,
  description: 200,
  address: 200,
  personName: 40,
  title: 100,
} as const

type Data = Record<string, unknown>

const KNOWN: Record<string, readonly string[]> = {
  territory: [
    'id',
    'number',
    'name',
    'link',
    'coordinate',
    'outline',
    'checkedOutAt',
    'returnBy',
    'createdAt',
    'houseRecords',
  ],
  street: [
    'id',
    'name',
    'numbering',
    'first',
    'descending',
    'saveLocations',
    'order',
  ],
  worked: ['at', 'by', 'byName'],
  door: [
    'label',
    'outcome',
    'at',
    'tries',
    'coordinate',
    'coordinateSource',
    'description',
    'by',
    'byName',
  ],
  doNotCall: ['address', 'at', 'coordinate', 'label', 'name', 'reason'],
  guest: ['name', 'linkId', 'joinedAt'],
}

export function withUnknownFields(
  kind: string,
  previous: Data | undefined,
  data: Data
): Data {
  if (!previous) return data
  const known = KNOWN[kind] ?? []
  const extra = Object.fromEntries(
    Object.entries(previous).filter(([field]) => !known.includes(field))
  )
  return Object.keys(extra).length > 0 ? { ...extra, ...data } : data
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isText = (value: unknown): value is string => typeof value === 'string'

const round6 = (value: number) => Math.round(value * 1e6) / 1e6

function readCoordinate(value: unknown): Coordinate | undefined {
  const point = value as Partial<Coordinate> | null
  if (
    typeof point !== 'object' ||
    point === null ||
    !isNumber(point.latitude) ||
    !isNumber(point.longitude) ||
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180
  )
    return undefined
  return { latitude: point.latitude, longitude: point.longitude }
}

const coordinateData = (point: Coordinate | undefined) =>
  point && { latitude: point.latitude, longitude: point.longitude }

const optional = <T>(field: string, value: T | undefined) =>
  value === undefined ? {} : { [field]: value }

const NUMBERINGS: readonly StreetNumbering[] = ['both', 'odd', 'even', 'none']
const OUTCOMES: readonly DoorOutcome[] = ['notHome', 'spoke', 'doNotCall']
const SOURCES: readonly CoordinateSource[] = ['gps', 'manual']

export type TerritoryHeader = Pick<
  Territory,
  | 'id'
  | 'number'
  | 'name'
  | 'link'
  | 'coordinate'
  | 'outline'
  | 'checkedOutAt'
  | 'returnBy'
  | 'createdAt'
> & { houseRecords: boolean }

export function territoryData(
  territory: Pick<
    Territory,
    | 'id'
    | 'number'
    | 'name'
    | 'link'
    | 'coordinate'
    | 'outline'
    | 'checkedOutAt'
    | 'returnBy'
    | 'createdAt'
  >,
  houseRecords: boolean
): Data {
  const outline = territory.outline
    ?.slice(0, TERRITORY_LIMITS.outlinePoints)
    .map((point) => ({
      latitude: round6(point.latitude),
      longitude: round6(point.longitude),
    }))
  return {
    id: territory.id,
    number: clip(territory.number, TERRITORY_LIMITS.number),
    ...optional(
      'name',
      territory.name && clip(territory.name, TERRITORY_LIMITS.name)
    ),
    ...optional(
      'link',
      territory.link && clip(territory.link, TERRITORY_LIMITS.link)
    ),
    ...optional('coordinate', coordinateData(territory.coordinate)),
    ...optional('outline', outline && outline.length > 0 ? outline : undefined),
    checkedOutAt: territory.checkedOutAt,
    ...optional('returnBy', territory.returnBy),
    createdAt: territory.createdAt,
    houseRecords,
  }
}

export function readTerritoryData(data: Data): TerritoryHeader | null {
  const { id, number, name, link, checkedOutAt, returnBy, createdAt } = data
  if (
    !isText(id) ||
    !isText(number) ||
    !isNumber(checkedOutAt) ||
    !isNumber(createdAt)
  )
    return null
  const outline = Array.isArray(data.outline)
    ? data.outline
        .slice(0, TERRITORY_LIMITS.outlinePoints)
        .map(readCoordinate)
        .filter((point) => point !== undefined)
    : undefined
  return {
    id,
    number: clip(number, TERRITORY_LIMITS.number),
    ...optional(
      'name',
      isText(name) && name ? clip(name, TERRITORY_LIMITS.name) : undefined
    ),
    ...optional(
      'link',
      isText(link) && link ? clip(link, TERRITORY_LIMITS.link) : undefined
    ),
    ...optional('coordinate', readCoordinate(data.coordinate)),
    ...optional('outline', outline && outline.length > 0 ? outline : undefined),
    checkedOutAt,
    ...optional('returnBy', isNumber(returnBy) ? returnBy : undefined),
    createdAt,
    houseRecords: data.houseRecords !== false,
  }
}

export type StreetFields = Pick<
  TerritoryStreet,
  'id' | 'name' | 'numbering' | 'first' | 'descending' | 'saveLocations'
> & { order: number }

export function streetData(street: TerritoryStreet, order: number): Data {
  return {
    id: street.id,
    name: clip(street.name, TERRITORY_LIMITS.streetName),
    numbering: street.numbering,
    ...optional('first', street.first),
    ...optional('descending', street.descending || undefined),
    ...optional('saveLocations', street.saveLocations),
    order,
  }
}

export function readStreetData(data: Data): StreetFields | null {
  const { id, name, numbering, first, descending, saveLocations, order } = data
  if (!isText(id) || !isUuid(id) || !isText(name)) return null
  return {
    id,
    name: clip(name, TERRITORY_LIMITS.streetName),
    numbering: NUMBERINGS.includes(numbering as StreetNumbering)
      ? (numbering as StreetNumbering)
      : 'both',
    ...optional('first', isNumber(first) ? first : undefined),
    ...optional('descending', descending === true ? true : undefined),
    ...optional(
      'saveLocations',
      typeof saveLocations === 'boolean' ? saveLocations : undefined
    ),
    order: isNumber(order) ? order : 0,
  }
}

export type WorkedFields = { at?: number; by?: string; byName?: string }

export const workedData = (
  at: number | undefined,
  by: string,
  byName: string | undefined
): Data => ({
  ...optional('at', at),
  by,
  ...optional('byName', byName && clip(byName, TERRITORY_LIMITS.personName)),
})

export function readWorkedData(data: Data): WorkedFields {
  return {
    ...optional('at', isNumber(data.at) ? data.at : undefined),
    ...optional('by', isText(data.by) ? data.by : undefined),
    ...optional(
      'byName',
      isText(data.byName)
        ? clip(data.byName, TERRITORY_LIMITS.personName)
        : undefined
    ),
  }
}

export type DoorFields = Omit<TerritoryDoor, 'id'> & { byName?: string }

export function doorData(
  door: TerritoryDoor,
  by: string,
  byName: string | undefined
): Data {
  return {
    label: clip(door.label, TERRITORY_LIMITS.doorLabel),
    outcome: door.outcome,
    at: door.at,
    tries: door.tries,
    ...optional('coordinate', coordinateData(door.coordinate)),
    ...optional(
      'coordinateSource',
      door.coordinate ? door.coordinateSource : undefined
    ),
    ...optional(
      'description',
      door.description && clip(door.description, TERRITORY_LIMITS.description)
    ),
    by,
    ...optional('byName', byName && clip(byName, TERRITORY_LIMITS.personName)),
  }
}

export function readDoorData(data: Data): DoorFields | null {
  const { label, outcome, at, tries, coordinateSource, description, by } = data
  if (
    !isText(label) ||
    !OUTCOMES.includes(outcome as DoorOutcome) ||
    !isNumber(at)
  )
    return null
  const coordinate = readCoordinate(data.coordinate)
  return {
    label: clip(label, TERRITORY_LIMITS.doorLabel),
    outcome: outcome as DoorOutcome,
    at,
    tries: isNumber(tries) && tries >= 1 ? Math.floor(tries) : 1,
    ...optional('coordinate', coordinate),
    ...optional(
      'coordinateSource',
      coordinate && SOURCES.includes(coordinateSource as CoordinateSource)
        ? (coordinateSource as CoordinateSource)
        : undefined
    ),
    ...optional(
      'description',
      isText(description) && description
        ? clip(description, TERRITORY_LIMITS.description)
        : undefined
    ),
    ...optional('by', isText(by) ? by : undefined),
    ...optional(
      'byName',
      isText(data.byName)
        ? clip(data.byName, TERRITORY_LIMITS.personName)
        : undefined
    ),
  }
}

export function doNotCallData(entry: TerritoryDoNotCall): Data {
  return {
    address: clip(entry.address, TERRITORY_LIMITS.address),
    at: entry.at,
    ...optional('coordinate', coordinateData(entry.coordinate)),
    ...optional(
      'label',
      entry.label && clip(entry.label, TERRITORY_LIMITS.doorLabel)
    ),
  }
}

export function readDoNotCallData(
  data: Data
): Omit<TerritoryDoNotCall, 'id' | 'streetId'> | null {
  const { address, at, label } = data
  if (!isText(address) || !isNumber(at)) return null
  return {
    address: clip(address, TERRITORY_LIMITS.address),
    at,
    ...optional('coordinate', readCoordinate(data.coordinate)),
    ...optional(
      'label',
      isText(label) && label
        ? clip(label, TERRITORY_LIMITS.doorLabel)
        : undefined
    ),
  }
}

export type GuestFields = { name: string; linkId: string; joinedAt: number }

export const guestData = (guest: GuestFields): Data => ({
  name: clip(guest.name.trim(), TERRITORY_LIMITS.personName),
  linkId: guest.linkId,
  joinedAt: guest.joinedAt,
})

export function readGuestData(data: Data): GuestFields | null {
  const { name, linkId, joinedAt } = data
  if (!isText(name) || !name.trim() || !isText(linkId) || !isNumber(joinedAt))
    return null
  return {
    name: clip(name.trim(), TERRITORY_LIMITS.personName),
    linkId,
    joinedAt,
  }
}

export const sameData = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right)
