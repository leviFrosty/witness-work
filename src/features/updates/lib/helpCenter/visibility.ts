import {
  HelpBundle,
  HelpCategory,
  HelpEntry,
} from '@/features/updates/types/helpCenter'

export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => parseInt(part, 10) || 0)
  const right = b.split('.').map((part) => parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

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

export const categoriesFor = (
  bundle: HelpBundle,
  entries: HelpEntry[]
): HelpCategory[] =>
  bundle.categories.filter((category) =>
    entries.some((entry) => entry.category === category.id)
  )
