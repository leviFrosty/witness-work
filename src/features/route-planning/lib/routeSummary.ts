import { getLocales } from 'expo-localization'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import {
  KM_PER_MILE,
  autoDistanceUnit,
  formatNumber,
  milesToDistance,
} from '@/lib/mileage/units'
import type { DistanceUnit } from '@/types/mileage'
import type { MinuteDisplayFormat } from '@/types/timeEntry'

const METERS_PER_MILE = KM_PER_MILE * 1000

export const formatRouteSummary = (
  summary: { distanceMeters: number; durationSeconds: number },
  prefs: { timeDisplayFormat: MinuteDisplayFormat; distanceUnit?: DistanceUnit }
): string => {
  return i18n.t('routePlan_summary', {
    duration: formatMinutes(
      Math.max(1, Math.round(summary.durationSeconds / 60)),
      prefs.timeDisplayFormat
    ).formatted,
    distance: formatRouteDistance(summary.distanceMeters, prefs.distanceUnit),
  })
}

export const formatRouteDistance = (
  meters: number,
  distanceUnit?: DistanceUnit
): string => {
  const unit = distanceUnit ?? autoDistanceUnit(getLocales()[0]?.regionCode)
  const miles = meters / METERS_PER_MILE
  return i18n.t(`mileage.unitValues.${unit}`, {
    value: formatNumber(milesToDistance(miles, unit)),
  })
}
