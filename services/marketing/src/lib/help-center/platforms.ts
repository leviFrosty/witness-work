import { HELP_PLATFORMS, type HelpPlatform } from './types.ts'

export type PlatformNoteKey = 'iosOnly' | 'androidOnly' | 'webOnly' | 'appsOnly'

const isAll = (platforms: HelpPlatform[]) =>
  HELP_PLATFORMS.every((p) => platforms.includes(p))

const same = (platforms: HelpPlatform[], ...expected: HelpPlatform[]) =>
  platforms.length === expected.length &&
  expected.every((p) => platforms.includes(p))

export function platformAttr(platforms: HelpPlatform[]): string | undefined {
  return isAll(platforms) ? undefined : platforms.join(' ')
}

export function platformNoteKey(
  platforms: HelpPlatform[]
): PlatformNoteKey | null {
  if (same(platforms, 'ios')) return 'iosOnly'
  if (same(platforms, 'android')) return 'androidOnly'
  if (same(platforms, 'web')) return 'webOnly'
  if (same(platforms, 'ios', 'android')) return 'appsOnly'
  return null
}

const NAMES: Record<HelpPlatform, string> = {
  ios: 'iOS (iPhone and iPad)',
  android: 'Android',
  web: 'WitnessWork on the web',
}

const SHORT_NAMES: Record<HelpPlatform, string> = {
  ios: 'iOS',
  android: 'Android',
  web: 'web',
}

const list = (names: string[]) => names.join(' and ')

export function platformScope(platforms: HelpPlatform[]): string | null {
  if (isAll(platforms)) return null
  if (same(platforms, 'ios', 'android')) return 'iOS and Android apps'
  return list(
    HELP_PLATFORMS.filter((p) => platforms.includes(p)).map((p) => NAMES[p])
  )
}

export function platformScopeShort(platforms: HelpPlatform[]): string | null {
  if (isAll(platforms)) return null
  return `${list(
    HELP_PLATFORMS.filter((p) => platforms.includes(p)).map(
      (p) => SHORT_NAMES[p]
    )
  )} only`
}
