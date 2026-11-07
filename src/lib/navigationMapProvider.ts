import type { DefaultNavigationMapProvider } from '@/stores/preferences'

export const browserOnApple = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ??
    navigator.platform ??
    ''
  return /mac|iphone|ipad|ipod/i.test(platform || navigator.userAgent)
}

export const resolveNavigationMapProvider = (
  provider: DefaultNavigationMapProvider,
  platform: string,
  onApple: () => boolean = browserOnApple
): DefaultNavigationMapProvider => {
  if (platform === 'ios' || (provider !== 'apple' && provider !== null))
    return provider
  if (platform === 'web') return onApple() ? 'apple' : 'google'
  return 'google'
}
