/**
 * Single seam for the supporter-only alternate-app-icon feature. Wraps the
 * `expo-alternate-app-icons` library so the rest of the app talks in
 * `AppIconVariant` (a stable user-visible enum) and never directly in the
 * plugin's PascalCase icon names.
 *
 * The `'Seasonal'` variant is special: the persisted preference value is just
 * `'Seasonal'`, but the actual native call resolves it to one of
 * `SeasonalSpring | SeasonalSummer | SeasonalFall | SeasonalWinter` based on
 * the user's hemisphere + the current date. That keeps the feature dynamic (the
 * icon shifts at season boundaries) without requiring the user to pick a
 * specific season tile.
 */

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
} from '../../../lib/hemisphere'
import {
  usePreferences,
  type AppIconVariant,
} from '../../../stores/preferences'

/**
 * The PascalCase plugin names declared in `app.config.ts` under
 * `expo-alternate-app-icons`. `null` means "the default bundle icon."
 */
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

/**
 * Hemisphere derivation that prefers a cached device coordinate (when the
 * contact map has already coaxed location permission) and falls back to the
 * device's ISO region code. Never prompts for new permissions and never hits
 * the network — `getLastKnownPositionAsync` returns whatever iOS already has
 * cached, or `null` if there's nothing.
 */
export const determineHemisphere = async (): Promise<Hemisphere> => {
  try {
    const perm = await Location.getForegroundPermissionsAsync()
    if (perm.granted) {
      const last = await Location.getLastKnownPositionAsync({
        // Accept anything cached within the last 30 days — hemisphere doesn't
        // change with mild travel and we want to avoid forcing a fresh fix.
        maxAge: 1000 * 60 * 60 * 24 * 30,
      })
      if (last) return hemisphereFromLatitude(last.coords.latitude)
    }
  } catch {
    // Permission/Location failures fall through to the regionCode path.
  }
  const region = Localization.getLocales()[0]?.regionCode ?? null
  return hemisphereFromRegion(region)
}

/**
 * Resolve a user-visible variant to the underlying plugin icon name. Returns
 * `null` for `'Default'` / `null` (falls back to the bundle icon).
 */
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

/**
 * Apply the resolved icon on the device. Idempotent — if the requested icon is
 * already active, the call is skipped. Swallows errors and logs them; the
 * picker UI surfaces a toast on failure separately.
 *
 * Routes through the patched `silent` path by default so we never trigger the
 * iOS "App Icon Updated" system alert (jarring, especially on the silent
 * lapse-revert and seasonal-rotation paths). Set
 * `preferences.devShowAppIconAlerts` from the dev-tools screen to flip back to
 * the public API for debugging — useful if the private selector ever stops
 * working and we need to compare behavior.
 */
export const applyAppIcon = async (
  target: PluginIconName | null
): Promise<void> => {
  if (!supportsAlternateIcons) return
  const current = getAppIconName()
  // The library returns `null` for the default icon; both paths normalize.
  const currentNorm = current ?? null
  if (currentNorm === target) return
  const silent = !usePreferences.getState().devShowAppIconAlerts
  await setAlternateAppIcon(target, { silent })
}

export const isAppIconSupported = (): boolean => supportsAlternateIcons
