import i18n from '@/lib/locales'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/numbers'
import {
  doorCounts,
  dueDate,
  isOverdue,
  territoryCounts,
  wholeNumber,
  type FormatDoorAddress,
} from '@/features/territories/lib/doors'
import type {
  Territory,
  TerritoryDoNotCall,
  TerritoryDoor,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export const territoryTitle = (territory: Pick<Territory, 'number'>) =>
  i18n.t('territories.titleWithNumber', { number: territory.number })

export const territoryListTitle = (
  territory: Pick<Territory, 'number' | 'name' | 'received' | 'streets'>
) =>
  (territory.received?.kind === 'handoff' &&
    territory.streets.map((street) => street.name).join(', ')) ||
  [territoryTitle(territory), territory.name].filter(Boolean).join(' · ')

export const receivedFromText = (
  territory: Pick<Territory, 'number' | 'received'>
) =>
  territory.received &&
  i18n.t(
    territory.received.kind === 'handoff'
      ? 'territories.share.fromLine'
      : 'territories.share.sharedFromLine',
    {
      name: territory.received.from.name,
      territory: territoryTitle(territory),
    }
  )

export const doorTitle = (
  street: Pick<TerritoryStreet, 'numbering'>,
  label: TerritoryDoor['label']
) =>
  street.numbering === 'none'
    ? i18n.t('territories.doorNumbered', { number: label })
    : label

export const formatDoorAddress: FormatDoorAddress = (street, door) => {
  if (street.numbering !== 'none')
    return i18n.t('territories.doorAddress', {
      number: door.label,
      street: street.name,
    })
  const described = door.description?.trim()
  return described
    ? i18n.t('territories.doorAddressDescribed', {
        description: described,
        street: street.name,
      })
    : i18n.t('territories.doorAddressUnnumbered', {
        number: door.label,
        street: street.name,
      })
}

export const territoryDates = (territory: Territory) =>
  territory.finishedAt !== undefined
    ? i18n.t('territories.finishedOn', {
        date: formatDate(territory.finishedAt, { style: 'medium' }),
      })
    : i18n.t('territories.returnBy', {
        date: formatDate(dueDate(territory), { style: 'medium' }),
      })

export const territoryDueText = (territory: Territory, now: number) =>
  isOverdue(territory, now)
    ? i18n.t('territories.overdue', { date: territoryDates(territory) })
    : territoryDates(territory)

const joined = (parts: (string | false | undefined)[]) =>
  parts.filter(Boolean).join(' · ')

export const territoryProgressText = (territory: Territory): string => {
  const counts = territoryCounts(territory)
  if (territory.streets.length === 0) return i18n.t('territories.noStreetsYet')
  return joined([
    counts.streets > 0 &&
      i18n.t('territories.streetsWorked', {
        worked: formatNumber(counts.streetsWorked),
        total: formatNumber(counts.streets),
        count: counts.streets,
      }),
    counts.handedOff > 0 &&
      i18n.t('territories.share.handedOffCount', { count: counts.handedOff }),
    counts.notHome > 0 &&
      i18n.t('territories.notHomeCount', { count: counts.notHome }),
  ])
}

export const handoffSummary = (
  street: TerritoryStreet,
  name: string
): string =>
  street.workedAt !== undefined
    ? i18n.t('territories.share.handedOffWorked', {
        name,
        date: formatDate(street.workedAt, { style: 'medium' }),
      })
    : i18n.t('territories.share.handedOffTo', {
        name,
        date: formatDate(street.handoff?.at ?? Date.now(), {
          style: 'medium',
        }),
      })

export const streetSummary = (
  street: TerritoryStreet,
  finished: boolean
): string => {
  const worked = street.workedAt !== undefined
  if (finished)
    return joined([
      worked &&
        i18n.t('territories.streetWorkedOn', {
          date: formatDate(street.workedAt, { style: 'medium' }),
        }),
      !worked && i18n.t('territories.streetNoRecord'),
    ])
  const counts = doorCounts(
    street.doors.filter((door) => door.outcome !== 'doNotCall')
  )
  const notHome =
    counts.notHome > 0 &&
    i18n.t('territories.notHomeCount', { count: counts.notHome })
  if (worked)
    return joined([
      i18n.t('territories.streetWorkedOn', {
        date: formatDate(street.workedAt, { style: 'medium' }),
      }),
      notHome,
    ])
  if (counts.total === 0) return i18n.t('territories.streetNotWorked')
  return joined([
    i18n.t('territories.streetInProgress'),
    i18n.t('territories.recordedCount', { count: counts.total }),
    notHome,
  ])
}

const SUMMARY_DOORS = 5
const SUMMARY_PLACE_CHARS = 32

const placeName = (
  street: Pick<TerritoryStreet, 'name'>,
  entry: Pick<TerritoryDoNotCall, 'address'>
) => {
  const address = entry.address.trim()
  const suffix = `, ${street.name}`
  return address.endsWith(suffix)
    ? address.slice(0, -suffix.length).trim()
    : address
}

export const streetDoNotCallSummary = (
  street: Pick<TerritoryStreet, 'name' | 'numbering'>,
  entries: Pick<TerritoryDoNotCall, 'label' | 'address'>[]
): string => {
  const numbered = street.numbering !== 'none'
  const doors = [
    ...new Set(
      entries
        .map((entry) => (numbered ? entry.label?.trim() : undefined))
        .filter((label): label is string => !!label)
    ),
  ].sort(
    (a, b) =>
      (wholeNumber(a) ?? Infinity) - (wholeNumber(b) ?? Infinity) ||
      a.localeCompare(b)
  )
  const places = [
    ...new Set(
      entries
        .filter((entry) => !numbered || !entry.label?.trim())
        .map((entry) => placeName(street, entry))
        .filter(Boolean)
    ),
  ]
  const shownDoors = doors.slice(0, SUMMARY_DOORS)
  const parts =
    shownDoors.length > 0
      ? [
          i18n.t('territories.doNotCallHouses', {
            count: shownDoors.length,
            doors: shownDoors.join(', '),
          }),
        ]
      : []
  const fit = places.findIndex(
    (_, index) =>
      [...parts, ...places.slice(0, index + 1)].join(', ').length >
      SUMMARY_PLACE_CHARS
  )
  const fitting = fit === -1 ? places.length : fit
  const shownPlaces = places.slice(
    0,
    parts.length === 0 ? Math.max(fitting, 1) : fitting
  )
  const shown = [...parts, ...shownPlaces]
  const more =
    doors.length - shownDoors.length + places.length - shownPlaces.length
  const listed = shown.join(', ')
  return i18n.t('territories.doNotCallDoors', {
    doors:
      more > 0
        ? i18n.t('territories.doNotCallMore', { places: listed, count: more })
        : listed,
  })
}
