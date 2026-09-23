import type { DefaultNavigationMapProvider } from '@/stores/preferences'

/** Restored preferences can name Apple Maps even on an Android device. */
export const resolveNavigationMapProvider = (
  provider: DefaultNavigationMapProvider,
  platform: string
): DefaultNavigationMapProvider =>
  platform === 'android' && (provider === 'apple' || provider === null)
    ? 'google'
    : provider
