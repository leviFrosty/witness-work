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

/** "42 min · 18.2 mi", honoring the Duration Format and distance unit. */
export const formatRouteSummary = (
  summary: { distanceMeters: number; durationSeconds: number },
  prefs: { timeDisplayFormat: MinuteDisplayFormat; distanceUnit?: DistanceUnit }
): string => {
  const unit =
    prefs.distanceUnit ?? autoDistanceUnit(getLocales()[0]?.regionCode)
  const miles = summary.distanceMeters / METERS_PER_MILE
  return i18n.t('routePlan_summary', {
    duration: formatMinutes(
      Math.max(1, Math.round(summary.durationSeconds / 60)),
      prefs.timeDisplayFormat
    ).formatted,
    distance: `${formatNumber(milesToDistance(miles, unit))} ${i18n.t(`mileage.units.${unit}`)}`,
  })
}
