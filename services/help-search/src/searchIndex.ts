import type { HelpEntry } from './contract'
import { decodeVector, encodeVector } from './embed'
import { termCounts, tokenize } from './text'
import { encodeVersion } from './version'

/**
 * One locale's search index, as sync writes it to KV (`index:<locale>`): every
 * answer's filters, keyword counts and embedding. About 1 MB.
 */
/**
 * Bumped when stored entries gain a field, so the next sync rebuilds every
 * index even when its bundle is unchanged. 2 added `web`.
 */
export const INDEX_VERSION = 2

export type StoredIndex = {
  version: number
  model: string
  /** The bundle this index was built from. */
  bundleHash: string
  builtAt: string
  entries: StoredEntry[]
}

export type StoredEntry = {
  slug: string
  /** Hash of the embedded text and model; an unchanged hash reuses `vector`. */
  hash: string
  ios: boolean
  android: boolean
  /** Absent from indexes built before the web was a platform. */
  web?: boolean
  /** `encodeVersion(minAppVersion)`, 0 when unset. */
  minAppVersion: number
  /** Token count of the question and answer. */
  length: number
  terms: Record<string, number>
  /** Unit-length Float32 embedding, base64. */
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
  /** Token → how many answers contain it. */
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
      // An index from before the web was a platform has no `web`. Answers for
      // both phones were its unscoped ones, so they stay in web results; the
      // next sync rewrites the index from the bundle.
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
