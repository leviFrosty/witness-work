import { parseRichTextDoc } from '@/lib/richText/parse'
import { richTextToPlainText } from '@/lib/richText/plainText'

/**
 * The Help Center parser and visibility check as they shipped in apps released
 * before `web` became a platform (frozen copy; do not update). They keep only
 * `ios` and `android` from `platforms` and read a missing field as both phones.
 * Tests feed today's bundles through it to prove those apps stay safe.
 */

type LegacyPlatform = 'ios' | 'android'
const PLATFORMS: LegacyPlatform[] = ['ios', 'android']
const VERSION = /^\d+\.\d+\.\d+$/
const SCHEMA_VERSION = 1

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => parseInt(part, 10) || 0)
  const right = b.split('.').map((part) => parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export type LegacyBundle = {
  schemaVersion: number
  locale: string
  hash: string
  entries: LegacyEntry[]
  [key: string]: unknown
}

export type LegacyEntry = {
  id: string
  slug: string
  category: string
  platforms: LegacyPlatform[]
  minAppVersion?: string
  [key: string]: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

function parseCategory(value: unknown): { id: string; title: string } | null {
  if (!isRecord(value) || !isText(value.id) || !isText(value.title)) return null
  return { id: value.id, title: value.title }
}

function parseLegacyEntry(value: unknown): LegacyEntry | null {
  if (!isRecord(value)) return null
  const { id, slug, category, question, url } = value
  if (![id, slug, category, question, url].every(isText)) return null
  if (!/^https:\/\//.test(url as string)) return null
  const doc = parseRichTextDoc(value.doc)
  if (!doc) return null
  const platforms = Array.isArray(value.platforms)
    ? PLATFORMS.filter((platform) =>
        (value.platforms as unknown[]).includes(platform)
      )
    : PLATFORMS
  const related = Array.isArray(value.related)
    ? value.related.filter((issue): issue is number => Number.isInteger(issue))
    : []
  // An unreadable version floor hides the entry rather than showing it to
  // every version.
  if (
    value.minAppVersion !== undefined &&
    value.minAppVersion !== null &&
    !(
      typeof value.minAppVersion === 'string' &&
      VERSION.test(value.minAppVersion)
    )
  )
    return null
  const minAppVersion =
    typeof value.minAppVersion === 'string' ? value.minAppVersion : undefined
  return {
    id: id as string,
    slug: slug as string,
    category: category as string,
    platforms,
    pinned: value.pinned === true,
    related,
    ...(minAppVersion && { minAppVersion }),
    question: question as string,
    doc,
    // The bundled snapshot leaves this out to save space; it's the doc's text.
    plainText: isText(value.plainText)
      ? value.plainText
      : richTextToPlainText(doc),
    url: url as string,
    ...(value.fallback === true && { fallback: true as const }),
  }
}

/**
 * Reads a Help Center bundle. Null when it isn't one, or is from another schema
 * version; malformed entries and categories are dropped rather than failing the
 * whole bundle.
 */
export function parseLegacyHelpBundle(value: unknown): LegacyBundle | null {
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION) return null
  if (!isText(value.locale) || !isText(value.hash)) return null
  if (!Array.isArray(value.categories) || !Array.isArray(value.entries))
    return null
  const categories = value.categories
    .map(parseCategory)
    .filter(
      (category): category is { id: string; title: string } => category !== null
    )
  // The first entry wins a duplicate id or slug (list keys and links).
  const ids = new Set<string>()
  const slugs = new Set<string>()
  const entries = value.entries
    .map(parseLegacyEntry)
    .filter((entry): entry is LegacyEntry => {
      if (!entry || ids.has(entry.id) || slugs.has(entry.slug)) return false
      ids.add(entry.id)
      slugs.add(entry.slug)
      return true
    })
  if (entries.length === 0) return null
  return {
    schemaVersion: SCHEMA_VERSION,
    locale: value.locale,
    hash: value.hash,
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '',
    categories,
    entries,
  }
}

/** The pre-`web` `isEntryVisible`, as phones in the field run it. */
export function isLegacyEntryVisible(
  entry: LegacyEntry,
  platform: string,
  version: string | null | undefined
): boolean {
  if (!entry.platforms.some((p) => p === platform)) return false
  if (!entry.minAppVersion || !version) return true
  return compareVersions(version, entry.minAppVersion) >= 0
}
