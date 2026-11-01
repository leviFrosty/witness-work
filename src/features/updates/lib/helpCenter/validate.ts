import { parseRichTextDoc } from '@/lib/richText/parse'
import { richTextToPlainText } from '@/lib/richText/plainText'
import {
  HELP_SCHEMA_VERSION,
  HelpBundle,
  HelpCategory,
  HelpEntry,
  HelpManifest,
  HelpPlatform,
} from '@/features/updates/types/helpCenter'

const PLATFORMS: HelpPlatform[] = ['ios', 'android']
const VERSION = /^\d+\.\d+\.\d+$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

function parseCategory(value: unknown): HelpCategory | null {
  if (!isRecord(value) || !isText(value.id) || !isText(value.title)) return null
  return { id: value.id, title: value.title }
}

function parseEntry(value: unknown): HelpEntry | null {
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

    plainText: isText(value.plainText)
      ? value.plainText
      : richTextToPlainText(doc),
    url: url as string,
    ...(value.fallback === true && { fallback: true as const }),
  }
}

export function parseHelpBundle(value: unknown): HelpBundle | null {
  if (!isRecord(value) || value.schemaVersion !== HELP_SCHEMA_VERSION)
    return null
  if (!isText(value.locale) || !isText(value.hash)) return null
  if (!Array.isArray(value.categories) || !Array.isArray(value.entries))
    return null
  const categories = value.categories
    .map(parseCategory)
    .filter((category): category is HelpCategory => category !== null)

  const ids = new Set<string>()
  const slugs = new Set<string>()
  const entries = value.entries
    .map(parseEntry)
    .filter((entry): entry is HelpEntry => {
      if (!entry || ids.has(entry.id) || slugs.has(entry.slug)) return false
      ids.add(entry.id)
      slugs.add(entry.slug)
      return true
    })
  if (entries.length === 0) return null
  return {
    schemaVersion: HELP_SCHEMA_VERSION,
    locale: value.locale,
    hash: value.hash,
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '',
    categories,
    entries,
  }
}

export function parseHelpManifest(value: unknown): HelpManifest | null {
  if (!isRecord(value) || value.schemaVersion !== HELP_SCHEMA_VERSION)
    return null
  if (!isRecord(value.locales)) return null
  const locales: HelpManifest['locales'] = {}
  for (const [locale, info] of Object.entries(value.locales)) {
    if (!isRecord(info) || !isText(info.hash) || !isText(info.path)) continue
    locales[locale] = {
      hash: info.hash,
      path: info.path,
      count: typeof info.count === 'number' ? info.count : 0,
    }
  }
  return {
    schemaVersion: HELP_SCHEMA_VERSION,
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '',
    locales,
  }
}
