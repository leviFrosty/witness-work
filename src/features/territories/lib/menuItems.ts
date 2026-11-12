import {
  holdsStreet,
  isReceivedLive,
  territoryAccess,
} from '@/features/territories/lib/sharing'
import { territoryPoint } from '@/features/territories/lib/territoryArea'
import {
  hasMapView,
  hasTerritoryMap,
  streetFocus,
  territoryMapMarkers,
} from '@/features/territories/lib/territoryMap'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export type TerritoryMenuItem =
  | 'map'
  | 'directions'
  | 'share'
  | 'notes'
  | 'edit'
  | 'reopen'
  | 'checkOutAgain'
  | 'return'
  | 'leave'
  | 'delete'

export type StreetMenuItem =
  | 'markWorked'
  | 'markNotWorked'
  | 'map'
  | 'share'
  | 'handOff'
  | 'notes'
  | 'edit'
  | 'delete'

export type MapTarget =
  | { kind: 'map' | 'card'; streetId?: string }
  | { kind: 'link'; url: string }

const markersFor = (territory: Territory, privacy: boolean) =>
  territoryMapMarkers(territory, { privacy, formatAddress: () => '' })

export const territoryMapTarget = (
  territory: Territory,
  privacy: boolean,
  streetId?: string
): MapTarget | null => {
  const markers = markersFor(territory, privacy)
  if (hasTerritoryMap(territory, markers))
    return {
      kind: hasMapView(territory, markers) ? 'map' : 'card',
      streetId: streetFocus(markers, streetId),
    }
  if (streetId === undefined && territory.link)
    return { kind: 'link', url: territory.link }
  return null
}

export const canShareTerritory = (territory: Territory) =>
  territory.finishedAt === undefined &&
  territoryAccess(territory) !== 'member' &&
  isReceivedLive(territory)

export const canAddFromNotes = (territory: Territory, privacy: boolean) =>
  territory.finishedAt === undefined && !privacy && territory.streets.length > 0

export const territoryMenuItems = (
  territory: Territory,
  { privacy }: { privacy: boolean }
): TerritoryMenuItem[] => {
  const finished = territory.finishedAt !== undefined
  const owner = territoryAccess(territory) === 'owner'
  const items: (TerritoryMenuItem | false)[] = [
    territoryMapTarget(territory, privacy) !== null && 'map',
    !!territoryPoint(territory) && 'directions',
    canShareTerritory(territory) && 'share',
    canAddFromNotes(territory, privacy) && 'notes',
    owner && 'edit',
    finished && 'reopen',
    finished && 'checkOutAgain',
    !finished && owner && 'return',
    !owner && 'leave',
    owner && 'delete',
  ]
  return items.filter((item) => item !== false)
}

export const streetMenuItems = (
  territory: Territory,
  street: TerritoryStreet,
  { privacy, buddiesAvailable }: { privacy: boolean; buddiesAvailable: boolean }
): StreetMenuItem[] => {
  const finished = territory.finishedAt !== undefined
  const access = territoryAccess(territory)
  const owner = access === 'owner'
  const live = isReceivedLive(territory)
  const handedOff = street.handoff !== undefined
  const held = access === 'member' && holdsStreet(territory, street.id)
  const canShare =
    !finished && live && (access !== 'member' || held) && !handedOff
  const marks = !finished && !handedOff && (privacy || live)
  const worked = street.workedAt !== undefined
  const items: (StreetMenuItem | false)[] = [
    marks && !worked && 'markWorked',
    marks && worked && 'markNotWorked',
    territoryMapTarget(territory, privacy, street.id) !== null && 'map',
    canShare && 'share',
    canShare && owner && buddiesAvailable && 'handOff',
    !privacy && !finished && !handedOff && 'notes',
    !finished && owner && 'edit',
    !finished && owner && 'delete',
  ]
  return items.filter((item) => item !== false)
}
