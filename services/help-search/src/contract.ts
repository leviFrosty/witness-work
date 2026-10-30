// Types and constants from the Help Center contract (v1). The source of truth
// is docs/help-center.md in this repo; keep this file in step with it.

export type Platform = 'ios' | 'android' | 'web'

export const isPlatform = (value: string): value is Platform =>
  value === 'ios' || value === 'android' || value === 'web'

export const LOCALES = [
  'en-US',
  'ar',
  'bem-ZM',
  'de-DE',
  'es-ES',
  'fr-FR',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'nl-NL',
  'pt-BR',
  'pt-PT',
  'ru-RU',
  'rw-RW',
  'sw-KE',
  'uk-UA',
  'vi-VN',
  'zh-CN',
  'zh-TW',
] as const

export type Locale = (typeof LOCALES)[number]

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value)

export type HelpManifest = {
  schemaVersion: 1
  generatedAt: string
  locales: Record<string, { hash: string; count: number; path: string }>
}

export type HelpEntry = {
  id: string
  slug: string
  category: string
  platforms: Platform[]
  pinned: boolean
  related: number[]
  minAppVersion?: string
  question: string
  doc: unknown
  plainText: string
  url: string
  fallback?: true
}

export type HelpBundle = {
  schemaVersion: 1
  locale: string
  hash: string
  generatedAt: string
  categories: { id: string; title: string }[]
  entries: HelpEntry[]
}

export const MANIFEST_PATH = '/help/bundle/manifest.json'
