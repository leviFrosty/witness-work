import type { DefaultNavigationMapProvider } from '@/stores/preferences'

/**
 * Restored preferences can name Apple Maps even on an Android device, and the
 * web has no Apple Maps app to open, so both fall back to Google Maps.
 */
export const resolveNavigationMapProvider = (
  provider: DefaultNavigationMapProvider,
  platform: string
): DefaultNavigationMapProvider =>
  platform !== 'ios' && (provider === 'apple' || provider === null)
    ? 'google'
    : provider
