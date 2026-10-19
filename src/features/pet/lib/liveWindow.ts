import type { RoomWindow, Season, TimeOfDay } from '@/types/pet'

/**
 * Regions mostly south of the equator (by land and people), where seasons run
 * opposite to the north's, territories included. Countries the equator splits
 * count where most of the land and people are: Indonesia, both Congos, Gabon
 * and Ecuador south; Kenya, Uganda, Somalia, Kiribati and the Maldives keep the
 * northern default, as does every region not listed.
 */
export const SOUTHERN_HEMISPHERE_REGIONS: ReadonlySet<string> = new Set([
  'AO',
  'AQ',
  'AR',
  'AS',
  'AU',
  'BI',
  'BO',
  'BR',
  'BV',
  'BW',
  'CC',
  'CD',
  'CG',
  'CK',
  'CL',
  'CX',
  'EC',
  'FJ',
  'FK',
  'GA',
  'GS',
  'HM',
  'ID',
  'IO',
  'KM',
  'LS',
  'MG',
  'MU',
  'MW',
  'MZ',
  'NA',
  'NC',
  'NF',
  'NR',
  'NU',
  'NZ',
  'PE',
  'PF',
  'PG',
  'PN',
  'PY',
  'RE',
  'RW',
  'SB',
  'SC',
  'SH',
  'SZ',
  'TF',
  'TK',
  'TL',
  'TO',
  'TV',
  'TZ',
  'UY',
  'VU',
  'WF',
  'WS',
  'YT',
  'ZA',
  'ZM',
  'ZW',
])

export const isSouthernHemisphere = (
  regionCode: string | null | undefined
): boolean =>
  !!regionCode && SOUTHERN_HEMISPHERE_REGIONS.has(regionCode.toUpperCase())

/** Time of day from the local hour: night < 6, dawn < 9, day < 17, dusk < 20. */
export function timeOfDayAt(now: Date): TimeOfDay {
  const hour = now.getHours()
  if (hour < 6) return 'night'
  if (hour < 9) return 'dawn'
  if (hour < 17) return 'day'
  if (hour < 20) return 'dusk'
  return 'night'
}

const NORTHERN_SEASONS: readonly Season[] = [
  'winter', // Jan
  'winter',
  'spring',
  'spring',
  'spring',
  'summer',
  'summer',
  'summer',
  'autumn',
  'autumn',
  'autumn',
  'winter', // Dec
]
const OPPOSITE: Record<Season, Season> = {
  spring: 'autumn',
  summer: 'winter',
  autumn: 'spring',
  winter: 'summer',
}

/** Meteorological season of the local date, flipped south of the equator. */
export function seasonAt(now: Date, regionCode?: string | null): Season {
  const northern = NORTHERN_SEASONS[now.getMonth()]
  return isSouthernHemisphere(regionCode) ? OPPOSITE[northern] : northern
}

export type ResolvedWindow = {
  time: TimeOfDay
  season: Season
  /** The time follows the clock (hidden moments only appear in a live sky). */
  liveTime: boolean
  liveSeason: boolean
}

/** The window's concrete time and season right now. */
export function resolveWindow(
  window: RoomWindow,
  now: Date,
  regionCode?: string | null
): ResolvedWindow {
  const liveTime = window.time === 'live'
  const liveSeason = window.season === 'live'
  return {
    time: window.time === 'live' ? timeOfDayAt(now) : window.time,
    season:
      window.season === 'live' ? seasonAt(now, regionCode) : window.season,
    liveTime,
    liveSeason,
  }
}
