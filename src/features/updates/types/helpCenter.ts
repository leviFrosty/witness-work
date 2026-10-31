import type { RichTextDoc } from '@/types/richText'

/**
 * The Help Center's content, published by the website (`witnesswork.app/help`,
 * ADR 0042) as one JSON bundle per locale. The contract lives in the website's
 * `docs/help-center.md`; this mirrors schema version 1.
 */

export const HELP_SCHEMA_VERSION = 1

export type HelpPlatform = 'ios' | 'android' | 'web'

/** A Help Center locale: the app's locale file name (`en-US`, `zh-TW`, `ar`). */
export type HelpLocale = string

export type HelpManifest = {
  schemaVersion: typeof HELP_SCHEMA_VERSION
  generatedAt: string
  locales: Record<HelpLocale, { hash: string; count: number; path: string }>
}

export type HelpCategory = {
  /** Stable id app code refers to (`streaks`, `supporter`). */
  id: string
  title: string
}

export type HelpEntry = {
  /** Stable camelCase id (`timeRollover`). */
  id: string
  /** Kebab-case id used in URLs and search results (`time-rollover`). */
  slug: string
  category: string
  /** Platforms the answer applies to; every platform when it applies to all. */
  platforms: HelpPlatform[]
  pinned: boolean
  /** GitHub issue numbers the question came from. */
  related: number[]
  /** Shown only on this app version (`x.y.z`) or newer. */
  minAppVersion?: string
  question: string
  doc: RichTextDoc
  /** The answer as plain text, for search and Copy. */
  plainText: string
  /** The entry's public page in this locale. */
  url: string
  /** English text: this locale has no translation yet. */
  fallback?: true
}

export type HelpBundle = {
  schemaVersion: typeof HELP_SCHEMA_VERSION
  locale: HelpLocale
  hash: string
  generatedAt: string
  categories: HelpCategory[]
  entries: HelpEntry[]
}
