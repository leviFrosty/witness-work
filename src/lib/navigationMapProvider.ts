import type { DefaultNavigationMapProvider } from '@/stores/preferences'

export const resolveNavigationMapProvider = (
  provider: DefaultNavigationMapProvider,
  platform: string
): DefaultNavigationMapProvider =>
  platform === 'android' && (provider === 'apple' || provider === null)
    ? 'google'
    : provider
