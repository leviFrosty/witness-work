import type { DefaultNavigationMapProvider } from '@/stores/preferences'

/**
 * Whether this browser runs on an Apple OS (macOS, iOS, iPadOS), where Apple
 * Maps' web links open Apple Maps. iPadOS reports itself as a Mac.
 */
export const browserOnApple = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ??
    navigator.platform ??
    ''
  return /mac|iphone|ipad|ipod/i.test(platform || navigator.userAgent)
}

/**
 * The maps app "Open in Maps" uses. Restored preferences can name Apple Maps on
 * an Android device, which has none. A browser has no app of its own: Apple
 * Maps' web links open Apple Maps on Apple OSes, and Google Maps elsewhere.
 */
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
