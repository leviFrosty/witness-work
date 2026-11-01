import type { RichTextDoc } from '@/types/richText'

export const HELP_SCHEMA_VERSION = 1

export type HelpPlatform = 'ios' | 'android'

export type HelpLocale = string

export type HelpManifest = {
  schemaVersion: typeof HELP_SCHEMA_VERSION
  generatedAt: string
  locales: Record<HelpLocale, { hash: string; count: number; path: string }>
}

export type HelpCategory = {
  id: string
  title: string
}

export type HelpEntry = {
  id: string

  slug: string
  category: string

  platforms: HelpPlatform[]
  pinned: boolean

  related: number[]

  minAppVersion?: string
  question: string
  doc: RichTextDoc

  plainText: string

  url: string

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
