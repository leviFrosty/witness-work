import { distanceToArea } from '@/features/territories/lib/territoryArea'
import type { Coordinate } from '@/types/contact'
import {
  updateStreet,
  type DoNotCallEntry,
  type FormatDoorAddress,
} from '@/features/territories/lib/doors'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export const AWAY_METRES = 400

const EARTH_METRES = 6_371_000

const radians = (degrees: number) => (degrees * Math.PI) / 180

export const distanceMetres = (from: Coordinate, to: Coordinate) => {
  const dLat = radians(to.latitude - from.latitude)
  const dLon = radians(to.longitude - from.longitude)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(dLon / 2) ** 2
  return 2 * EARTH_METRES * Math.asin(Math.min(1, Math.sqrt(a)))
}

export const distanceToOutline = (
  fix: Coordinate,
  outline: readonly Coordinate[] | undefined
): number | undefined => (outline ? distanceToArea(fix, outline) : undefined)

export const streetReferencePoints = (
  territory: Pick<Territory, 'coordinate' | 'doNotCalls'>,
  street: Pick<TerritoryStreet, 'id' | 'doors'>,
  exceptLabel?: string
): Coordinate[] => [
  ...(territory.coordinate ? [territory.coordinate] : []),
  ...street.doors.flatMap((door) =>
    door.coordinate && door.label !== exceptLabel ? [door.coordinate] : []
  ),
  ...territory.doNotCalls.flatMap((entry) =>
    entry.coordinate && entry.streetId === street.id ? [entry.coordinate] : []
  ),
]

export const awayFromStreet = (
  fix: Coordinate,
  territory: Pick<Territory, 'coordinate' | 'doNotCalls' | 'outline'>,
  street: Pick<TerritoryStreet, 'id' | 'doors'>,
  exceptLabel?: string
) => {
  const distances = [
    distanceToOutline(fix, territory.outline),
    ...streetReferencePoints(territory, street, exceptLabel).map((point) =>
      distanceMetres(fix, point)
    ),
  ].filter((distance): distance is number => distance !== undefined)
  if (distances.length === 0) return false
  return Math.min(...distances) > AWAY_METRES
}

export const autoPinDoor = (
  street: TerritoryStreet,
  label: string,
  coordinate: Coordinate
): TerritoryStreet => ({
  ...street,
  doors: street.doors.map((door) =>
    door.label === label && !door.coordinate
      ? { ...door, coordinate, coordinateSource: 'gps' }
      : door
  ),
})

export const setDoorPin = (
  street: TerritoryStreet,
  doorId: string,
  coordinate: Coordinate | undefined
): TerritoryStreet => ({
  ...street,
  doors: street.doors.map((door) =>
    door.id !== doorId
      ? door
      : coordinate
        ? { ...door, coordinate, coordinateSource: 'manual' }
        : { ...door, coordinate: undefined, coordinateSource: undefined }
  ),
})

export const pinCentre = (
  territory: Pick<Territory, 'coordinate' | 'outline' | 'doNotCalls'>,
  street?: Pick<TerritoryStreet, 'id' | 'doors'>
): Coordinate | undefined => {
  const pinned = street
    ? streetReferencePoints({ doNotCalls: territory.doNotCalls }, street)
    : []
  const points =
    pinned.length > 0
      ? pinned
      : territory.coordinate
        ? [territory.coordinate]
        : (territory.outline ?? [])
  if (points.length === 0) return undefined
  return {
    latitude:
      points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude:
      points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  }
}

export const wholeYearsSince = (at: number, now: number) => {
  const from = new Date(at)
  const to = new Date(now)
  const years = to.getFullYear() - from.getFullYear()
  const early =
    to.getMonth() < from.getMonth() ||
    (to.getMonth() === from.getMonth() && to.getDate() < from.getDate())
  return Math.max(0, early ? years - 1 : years)
}

export type DoNotCallField = 'number' | 'description' | 'address'

export const doNotCallField = (
  territory: Territory,
  entry: DoNotCallEntry
): { field: DoNotCallField; text: string } => {
  const street = territory.streets.find((had) => had.id === entry.streetId)
  if (entry.fromDoor && street) {
    const door = street.doors.find((had) => had.id === entry.id)
    if (street.numbering === 'none')
      return { field: 'description', text: door?.description ?? '' }
    return { field: 'number', text: door?.label ?? entry.label ?? '' }
  }
  if (street && entry.label !== undefined && street.numbering !== 'none')
    return { field: 'number', text: entry.label }
  return { field: 'address', text: entry.address }
}

export const doNotCallNumberTaken = (
  territory: Territory,
  entry: Pick<DoNotCallEntry, 'id' | 'streetId'>,
  label: string,
  formatAddress: FormatDoorAddress
) => {
  const street = territory.streets.find((had) => had.id === entry.streetId)
  const typed = label.trim()
  if (!street || !typed) return false
  const address = formatAddress(street, { label: typed }).trim().toLowerCase()
  return (
    street.doors.some((door) => door.id !== entry.id && door.label === typed) ||
    territory.doNotCalls.some(
      (other) =>
        other.id !== entry.id &&
        (other.streetId === street.id && other.label !== undefined
          ? other.label === typed
          : other.address.trim().toLowerCase() === address)
    )
  )
}

export type DoNotCallEdit = {
  text: string
  at: number
  coordinate: Coordinate | undefined
}

const sameCoordinate = (
  left: Coordinate | undefined,
  right: Coordinate | undefined
) => left?.latitude === right?.latitude && left?.longitude === right?.longitude

export const editDoNotCall = (
  territory: Territory,
  entry: DoNotCallEntry,
  edit: DoNotCallEdit,
  now: number,
  formatAddress: FormatDoorAddress
): Territory => {
  const at = Math.min(edit.at, now)
  const text = edit.text.trim()
  const { field } = doNotCallField(territory, entry)
  const street = territory.streets.find((had) => had.id === entry.streetId)
  if (entry.fromDoor && street)
    return updateStreet(territory, street.id, (current) => ({
      ...current,
      doors: current.doors.map((door) =>
        door.id !== entry.id
          ? door
          : {
              ...door,
              at,
              label: field === 'number' && text ? text : door.label,
              description:
                field === 'description' ? text || undefined : door.description,
              coordinate: edit.coordinate,
              coordinateSource: !edit.coordinate
                ? undefined
                : sameCoordinate(door.coordinate, edit.coordinate)
                  ? door.coordinateSource
                  : 'manual',
            }
      ),
    }))
  return {
    ...territory,
    doNotCalls: territory.doNotCalls.map((had) =>
      had.id !== entry.id
        ? had
        : {
            ...had,
            at,
            coordinate: edit.coordinate,
            ...(field === 'number' && street && text
              ? { label: text, address: formatAddress(street, { label: text }) }
              : field === 'address' && text
                ? { address: text }
                : {}),
          }
    ),
  }
}

export type DoorPinState = 'on' | 'off' | 'denied' | 'away'

export const doorPinState = ({
  on,
  access,
  away,
}: {
  on: boolean
  access: 'granted' | 'ask' | 'denied' | null
  away: boolean
}): DoorPinState =>
  !on ? 'off' : access === 'denied' ? 'denied' : away ? 'away' : 'on'
