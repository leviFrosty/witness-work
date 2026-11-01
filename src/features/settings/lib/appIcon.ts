import * as Localization from 'expo-localization'
import * as Location from 'expo-location'
import {
  getAppIconName,
  setAlternateAppIcon,
  supportsAlternateIcons,
} from 'expo-alternate-app-icons'
import {
  hemisphereFromLatitude,
  hemisphereFromRegion,
  seasonFor,
  type Hemisphere,
  type Season,
} from '@/features/settings/lib/hemisphere'
import { usePreferences, type AppIconVariant } from '@/stores/preferences'

type PluginIconName =
  | 'Gold'
  | 'Dark'
  | 'Minimalist'
  | 'Mono'
  | 'SeasonalSpring'
  | 'SeasonalSummer'
  | 'SeasonalFall'
  | 'SeasonalWinter'

const SEASON_TO_PLUGIN: Record<Season, PluginIconName> = {
  spring: 'SeasonalSpring',
  summer: 'SeasonalSummer',
  fall: 'SeasonalFall',
  winter: 'SeasonalWinter',
}

export const determineHemisphere = async (): Promise<Hemisphere> => {
  try {
    const perm = await Location.getForegroundPermissionsAsync()
    if (perm.granted) {
      const last = await Location.getLastKnownPositionAsync({
        maxAge: 1000 * 60 * 60 * 24 * 30,
      })
      if (last) return hemisphereFromLatitude(last.coords.latitude)
    }
  } catch {}
  const region = Localization.getLocales()[0]?.regionCode ?? null
  return hemisphereFromRegion(region)
}

export const resolvePluginIcon = (
  variant: AppIconVariant | null,
  hemisphere: Hemisphere,
  now: Date = new Date()
): PluginIconName | null => {
  if (!variant || variant === 'Default') return null
  if (variant === 'Seasonal')
    return SEASON_TO_PLUGIN[seasonFor(now, hemisphere)]
  return variant
}

export const applyAppIcon = async (
  target: PluginIconName | null
): Promise<void> => {
  if (!supportsAlternateIcons) return
  const current = getAppIconName()

  const currentNorm = current ?? null
  if (currentNorm === target) return
  const silent = !usePreferences.getState().devShowAppIconAlerts
  await setAlternateAppIcon(target, { silent })
}

export const isAppIconSupported = (): boolean => supportsAlternateIcons
