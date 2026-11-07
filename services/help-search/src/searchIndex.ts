import type { HelpEntry } from './contract'
import { decodeVector, encodeVector } from './embed'
import { termCounts, tokenize } from './text'
import { encodeVersion } from './version'

export const INDEX_VERSION = 2

export type StoredIndex = {
  version: number
  model: string

  bundleHash: string
  builtAt: string
  entries: StoredEntry[]
}

export type StoredEntry = {
  slug: string

  hash: string
  ios: boolean
  android: boolean

  web?: boolean

  minAppVersion: number

  length: number
  terms: Record<string, number>

  vector: string
}

export const indexKey = (locale: string) => `index:${locale}`

export function storedEntry(
  entry: HelpEntry,
  hash: string,
  vector: string | Float32Array
): StoredEntry {
  const tokens = tokenize(`${entry.question}\n${entry.plainText}`)
  return {
    slug: entry.slug,
    hash,
    ios: entry.platforms.includes('ios'),
    android: entry.platforms.includes('android'),
    web: entry.platforms.includes('web'),
    minAppVersion:
      (entry.minAppVersion && encodeVersion(entry.minAppVersion)) || 0,
    length: tokens.length,
    terms: termCounts(tokens),
    vector: typeof vector === 'string' ? vector : encodeVector(vector),
  }
}

export type LoadedEntry = Omit<StoredEntry, 'vector' | 'hash' | 'web'> & {
  web: boolean
  vector: Float32Array
}

export type LoadedIndex = {
  model: string
  bundleHash: string
  entries: LoadedEntry[]

  documentFrequency: Map<string, number>
  averageLength: number
}

export function loadIndex(stored: StoredIndex): LoadedIndex {
  const documentFrequency = new Map<string, number>()
  let totalLength = 0
  const entries = stored.entries.map(({ hash: _hash, vector, ...entry }) => {
    for (const term in entry.terms)
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    totalLength += entry.length
    return {
      ...entry,

      web: entry.web ?? (entry.ios && entry.android),
      vector: decodeVector(vector),
    }
  })
  return {
    model: stored.model,
    bundleHash: stored.bundleHash,
    entries,
    documentFrequency,
    averageLength: totalLength / (entries.length || 1),
  }
}
