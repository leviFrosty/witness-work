import type { Coordinate } from '@/types/contact'
import {
  territoryDoNotCalls,
  type FormatDoorAddress,
} from '@/features/territories/lib/doors'
import { isOutline } from '@/features/territories/lib/territoryArea'
import type {
  DoorOutcome,
  Territory,
  TerritoryPerson,
} from '@/features/territories/types/territory'

export type TerritoryMapView = 'map' | 'card'

export type DoorMarker = {
  kind: 'door'
  id: string
  streetId: string
  coordinate: Coordinate
  outcome: Exclude<DoorOutcome, 'doNotCall'>
  address: string
  at: number
  tries: number
  by?: TerritoryPerson
}

export type DoNotCallMarker = {
  kind: 'doNotCall'
  id: string
  streetId?: string
  coordinate: Coordinate
  address: string
  at: number
}

export type TerritoryMarker = DoorMarker | DoNotCallMarker

export const territoryMapMarkers = (
  territory: Territory,
  options: { privacy: boolean; formatAddress: FormatDoorAddress }
): TerritoryMarker[] => {
  const people = territory.people ?? []
  const doors: DoorMarker[] = options.privacy
    ? []
    : territory.streets.flatMap((street) =>
        street.doors.flatMap((door) =>
          door.coordinate && door.outcome !== 'doNotCall'
            ? [
                {
                  kind: 'door' as const,
                  id: door.id,
                  streetId: street.id,
                  coordinate: door.coordinate,
                  outcome: door.outcome,
                  address: options.formatAddress(street, door),
                  at: door.at,
                  tries: door.tries,
                  by: door.by
                    ? people.find((person) => person.id === door.by)
                    : undefined,
                },
              ]
            : []
        )
      )
  const doNotCalls: DoNotCallMarker[] = territoryDoNotCalls(
    territory,
    options.formatAddress
  ).flatMap((entry) =>
    entry.coordinate
      ? [
          {
            kind: 'doNotCall' as const,
            id: entry.id,
            streetId: entry.streetId,
            coordinate: entry.coordinate,
            address: entry.address,
            at: entry.at,
          },
        ]
      : []
  )
  return [...doors, ...doNotCalls]
}

export const hasMapView = (
  territory: Pick<Territory, 'coordinate' | 'outline'>,
  markers: readonly TerritoryMarker[]
) =>
  !!territory.coordinate || isOutline(territory.outline) || markers.length > 0

export const hasTerritoryMap = (
  territory: Pick<Territory, 'coordinate' | 'outline' | 'photo'>,
  markers: readonly TerritoryMarker[]
) => !!territory.photo || hasMapView(territory, markers)

export const openingView = (
  territory: Pick<Territory, 'coordinate' | 'outline' | 'photo'>,
  markers: readonly TerritoryMarker[],
  asked?: TerritoryMapView
): TerritoryMapView => {
  const map = hasMapView(territory, markers)
  if (!territory.photo) return 'map'
  if (!map) return 'card'
  return asked ?? 'map'
}

export const streetFocus = (
  markers: readonly TerritoryMarker[],
  streetId: string | undefined
) =>
  streetId !== undefined &&
  markers.some((marker) => marker.streetId === streetId)
    ? streetId
    : undefined

export const fitPoints = (
  territory: Pick<Territory, 'coordinate' | 'outline'>,
  markers: readonly TerritoryMarker[],
  streetId?: string
): Coordinate[] => {
  if (streetId) {
    const onStreet = markers
      .filter((marker) => marker.streetId === streetId)
      .map((marker) => marker.coordinate)
    if (onStreet.length > 0) return onStreet
  }
  return [
    ...(isOutline(territory.outline) ? territory.outline : []),
    ...(territory.coordinate ? [territory.coordinate] : []),
    ...markers.map((marker) => marker.coordinate),
  ]
}

export const MARKER_SIZE = 30

const METRES_PER_DEGREE = 111_320

const metresBetween = (from: Coordinate, to: Coordinate) => {
  const latitude = ((from.latitude + to.latitude) / 2) * (Math.PI / 180)
  const north = (to.latitude - from.latitude) * METRES_PER_DEGREE
  const east =
    (to.longitude - from.longitude) * METRES_PER_DEGREE * Math.cos(latitude)
  return Math.hypot(north, east)
}

export const markerSpacing = (
  coordinates: readonly Coordinate[]
): number | undefined => {
  if (coordinates.length < 2) return undefined
  const nearest = coordinates
    .map((coordinate, index) =>
      Math.min(
        ...coordinates.flatMap((other, at) =>
          at === index ? [] : [metresBetween(coordinate, other)]
        )
      )
    )
    .sort((left, right) => left - right)
  return nearest[Math.floor(nearest.length / 2)]
}

export const metresPerPoint = (latitudeDelta: number, mapHeight: number) =>
  mapHeight > 0 ? (latitudeDelta * METRES_PER_DEGREE) / mapHeight : undefined

export const showsMarkerDots = (
  spacing: number | undefined,
  perPoint: number | undefined
) =>
  spacing !== undefined &&
  perPoint !== undefined &&
  spacing / perPoint < MARKER_SIZE

export const drawsAsDot = (
  marker: Pick<TerritoryMarker, 'kind'>,
  dots: boolean
) => dots && marker.kind === 'door'
