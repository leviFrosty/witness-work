import moment from 'moment'
import i18n from '@/lib/locales'
import {
  formatDate,
  formatDateTime,
  formatDisplay,
  formatMonthDayCompact,
  formatTime,
} from '@/lib/dates'
import {
  coversWholeTerritory,
  personById,
  sharedStreets,
  shareTimeLeft,
} from '@/features/territories/lib/sharing'
import type { GuestLinkDays } from '@/features/territories/lib/linkLifetime'
import { territoryTitle } from '@/features/territories/lib/territoryTitle'
import type {
  Territory,
  TerritoryShare,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MINUTE_MS = 60 * 1000

export const joinNames = (names: string[]): string => {
  const [first, second] = names
  if (names.length === 0 || first === undefined) return ''
  if (names.length === 1 || second === undefined) return first
  if (names.length === 2)
    return i18n.t('territories.share.namesTwo', { first, second })
  return i18n.t('territories.share.namesMore', {
    first,
    second,
    count: names.length - 2,
  })
}

export const shareScopeText = (
  territory: Pick<Territory, 'streets' | 'received'>,
  share: Pick<TerritoryShare, 'streetIds' | 'by'>
): string =>
  territory.received?.kind === 'handoff' ||
  (share.streetIds && !coversWholeTerritory(territory, share.streetIds))
    ? sharedStreets(territory, share)
        .map((street) => street.name)
        .join(', ')
    : i18n.t('territories.share.wholeTerritory')

export const linkHeading = (
  territory: Pick<Territory, 'number' | 'streets' | 'received'>,
  share: Pick<TerritoryShare, 'streetIds' | 'by'>
): string =>
  i18n.t('territories.share.linkHeading', {
    territory: territoryTitle(territory),
    covers: shareScopeText(territory, share),
  })

export const pickedScopeText = (
  streets: Pick<TerritoryStreet, 'id' | 'name'>[],
  chosen: string[],
  whole: boolean
): string => {
  if (whole) return i18n.t('territories.share.wholeTerritory')
  const picked = streets.filter((street) => chosen.includes(street.id))
  const [only] = picked
  if (!only) return i18n.t('territories.share.scopeNone')
  if (picked.length === 1) return only.name
  return i18n.t('territories.share.scopeStreets', { count: picked.length })
}

export const timeLeftText = (share: TerritoryShare, now: number): string => {
  const left = shareTimeLeft(share, now)
  if (left === undefined) return ''
  if (left <= 0) return i18n.t('territories.share.linkEnded')
  if (left >= 2 * DAY_MS)
    return i18n.t('territories.share.daysLeft', {
      count: Math.ceil(left / DAY_MS),
    })
  if (left >= HOUR_MS)
    return i18n.t('territories.share.hoursLeft', {
      count: Math.floor(left / HOUR_MS),
    })
  return i18n.t('territories.share.minutesLeft', {
    count: Math.max(1, Math.ceil(left / MINUTE_MS)),
  })
}

export const linkOpenUntilText = (expiresAt: number, now: number): string => {
  const ends = moment(expiresAt)
  const days = ends
    .clone()
    .startOf('day')
    .diff(moment(now).startOf('day'), 'days')
  if (days <= 0)
    return i18n.t('territories.guest.openUntilToday', {
      time: formatTime(expiresAt),
    })
  if (days === 1)
    return i18n.t('territories.guest.openUntilTomorrow', {
      time: formatTime(expiresAt),
    })
  return i18n.t('territories.guest.openUntil', {
    date: formatMonthDayCompact(ends),
  })
}

export const linkEndsText = (share: TerritoryShare): string =>
  share.expiresAt === undefined
    ? ''
    : i18n.t('territories.share.endsAt', {
        time: formatDateTime(share.endedAt ?? share.expiresAt, {
          style: 'medium',
        }),
      })

export const personName = (
  territory: Pick<Territory, 'people'>,
  id: string | undefined
): string =>
  personById(territory, id)?.name ?? i18n.t('territories.share.someone')

const isToday = (at: number) =>
  new Date(at).toDateString() === new Date().toDateString()

const dayText = (at: number) =>
  i18n.t('territories.weekdayDate', {
    weekday: formatDisplay(at, 'ddd'),
    date:
      new Date(at).getFullYear() === new Date().getFullYear()
        ? formatMonthDayCompact(moment(at))
        : formatDate(at, { style: 'medium' }),
  })

export const doorWhenText = (at: number): string =>
  i18n.t('territories.doorWhen', { date: dayText(at), time: formatTime(at) })

export const doorRecordedText = (at: number): string =>
  isToday(at)
    ? i18n.t('territories.doorToday', { time: formatTime(at) })
    : doorWhenText(at)

export const recordedByText = (name: string | null, at: number): string =>
  name === null
    ? isToday(at)
      ? i18n.t('territories.share.recordedByYouAt', { time: formatTime(at) })
      : i18n.t('territories.share.recordedByYouOn', {
          date: doorWhenText(at),
        })
    : isToday(at)
      ? i18n.t('territories.share.recordedByAt', { name, time: formatTime(at) })
      : i18n.t('territories.share.recordedByOn', {
          name,
          date: doorWhenText(at),
        })

export const hasOthers = (territory: Pick<Territory, 'people' | 'received'>) =>
  (territory.people?.length ?? 0) > 0 || territory.received !== undefined

export const guestLinkDaysLabel = (days: GuestLinkDays): string =>
  days === 7 || days === 14
    ? i18n.t('territories.share.lastsWeeks', { count: days / 7 })
    : i18n.t('territories.share.lastsDays', { count: days })
