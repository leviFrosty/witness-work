import type { RoomWindow, Season, TimeOfDay } from '@/types/pet'

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

export function timeOfDayAt(now: Date): TimeOfDay {
  const hour = now.getHours()
  if (hour < 6) return 'night'
  if (hour < 9) return 'dawn'
  if (hour < 17) return 'day'
  if (hour < 20) return 'dusk'
  return 'night'
}

const NORTHERN_SEASONS: readonly Season[] = [
  'winter',
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
  'winter',
]
const OPPOSITE: Record<Season, Season> = {
  spring: 'autumn',
  summer: 'winter',
  autumn: 'spring',
  winter: 'summer',
}

export function seasonAt(now: Date, regionCode?: string | null): Season {
  const northern = NORTHERN_SEASONS[now.getMonth()]
  return isSouthernHemisphere(regionCode) ? OPPOSITE[northern] : northern
}

export type ResolvedWindow = {
  time: TimeOfDay
  season: Season

  liveTime: boolean
  liveSeason: boolean
}

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
