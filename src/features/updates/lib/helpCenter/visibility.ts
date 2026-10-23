import {
  HelpBundle,
  HelpCategory,
  HelpEntry,
} from '@/features/updates/types/helpCenter'

/** Compares `x.y.z` versions; missing or non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => parseInt(part, 10) || 0)
  const right = b.split('.').map((part) => parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Whether `entry` applies on `platform` and app `version`. An unknown app
 * version shows every entry rather than hiding answers.
 */
export function isEntryVisible(
  entry: HelpEntry,
  platform: string,
  version: string | null | undefined
): boolean {
  if (!entry.platforms.some((p) => p === platform)) return false
  if (!entry.minAppVersion || !version) return true
  return compareVersions(version, entry.minAppVersion) >= 0
}

const visible = new WeakMap<HelpBundle, Map<string, HelpEntry[]>>()

/**
 * The entries shown on `platform` and `version`, in bundle order. The same
 * bundle and filter return the same array, so search can keep its index.
 */
export function visibleEntries(
  bundle: HelpBundle,
  platform: string,
  version: string | null | undefined
): HelpEntry[] {
  let byFilter = visible.get(bundle)
  if (!byFilter) visible.set(bundle, (byFilter = new Map()))
  const key = `${platform}@${version ?? ''}`
  let entries = byFilter.get(key)
  if (!entries) {
    entries = bundle.entries.filter((entry) =>
      isEntryVisible(entry, platform, version)
    )
    byFilter.set(key, entries)
  }
  return entries
}

/** The categories that have at least one of `entries`, in bundle order. */
export const categoriesFor = (
  bundle: HelpBundle,
  entries: HelpEntry[]
): HelpCategory[] =>
  bundle.categories.filter((category) =>
    entries.some((entry) => entry.category === category.id)
  )
