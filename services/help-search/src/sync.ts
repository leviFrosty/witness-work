import {
  isLocale,
  MANIFEST_PATH,
  type HelpBundle,
  type HelpEntry,
  type HelpManifest,
} from './contract'
import { documentText, embed, EMBED_BATCH, EMBEDDING_MODEL } from './embed'
import {
  indexKey,
  storedEntry,
  type StoredEntry,
  type StoredIndex,
} from './searchIndex'

/** Hash of what an answer's embedding depends on: its text and the model. */
export async function hashEntry(entry: HelpEntry): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify([EMBEDDING_MODEL, documentText(entry)])
  )
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest).slice(0, 12)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export type SyncOptions = {
  /** Site to pull bundles from. */
  origin?: string
  /** Bundles to index instead of fetching them. */
  bundles?: HelpBundle[]
  /** Rebuild locales whose bundle hash is unchanged. */
  force?: boolean
  /**
   * Most answers to embed in one run. A locale is built whole or not at all, so
   * one that doesn't fit waits for the next run (the first one always gets
   * built, so every run makes progress).
   */
  budget?: number
}

export type LocaleSummary = {
  status: 'unchanged' | 'synced' | 'deferred' | 'error'
  /** Answers embedded this run. */
  embedded: number
  /** Answers whose embedding was reused. */
  reused: number
  /** Answers still to embed (deferred). */
  remaining: number
  error?: string
}

export type SyncSummary = {
  locales: Record<string, LocaleSummary>
  remaining: number
}

export type SyncEnv = {
  AI: Ai
  SYNC_STATE: KVNamespace
}

/** Every answer of every locale is 3,496 (October 2026). */
const DEFAULT_BUDGET = 5_000
const CONCURRENCY = 4

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    cf: { cacheTtl: 0 },
  })
  if (!response.ok) throw new Error(`GET ${url} → ${response.status}`)
  return (await response.json()) as T
}

function validBundle(bundle: HelpBundle, locale: string): string | undefined {
  if (bundle?.schemaVersion !== 1) return 'unsupported schemaVersion'
  if (bundle.locale !== locale) return `bundle locale ${bundle.locale}`
  if (!Array.isArray(bundle.entries)) return 'entries missing'
  if (new Set(bundle.entries.map((e) => e.slug)).size !== bundle.entries.length)
    return 'duplicate slugs'
}

/** Runs `run` over `items`, a few at a time; rejects with the first error. */
async function pool<T>(
  items: T[],
  run: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await run(items[next++])
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}

const isRateLimited = (error: unknown) =>
  /rate.?limit|429|capacity/i.test(String(error))

/** Retries `run` with backoff while Workers AI rate-limits it. */
export async function withRetry<T>(
  run: () => Promise<T>,
  { tries = 4, delayMs = 1_000 } = {}
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= tries || !isRateLimited(error)) throw error
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs * 2 ** (attempt - 1))
      )
    }
  }
}

/**
 * Builds the search index of every locale whose bundle changed and writes it to
 * KV. Answers keep their embedding while their text is unchanged; a translation
 * still on the English text (`fallback`) shares English's.
 */
export async function runSync(
  env: SyncEnv,
  options: SyncOptions
): Promise<SyncSummary> {
  let budget = options.budget ?? DEFAULT_BUDGET
  let built = 0
  const summary: SyncSummary = { locales: {}, remaining: 0 }
  /** Embedding by entry hash, from stored indexes and this run. */
  const vectors = new Map<string, string | Float32Array>()

  // locale → how to get its bundle and the hash it should end up at.
  const sources = new Map<
    string,
    { hash: string; load: () => Promise<HelpBundle> }
  >()
  if (options.bundles) {
    for (const bundle of options.bundles)
      sources.set(bundle.locale, {
        hash: bundle.hash,
        load: async () => bundle,
      })
  } else {
    const origin = options.origin ?? 'https://witnesswork.app'
    const manifest = await fetchJson<HelpManifest>(origin + MANIFEST_PATH)
    if (manifest.schemaVersion !== 1)
      throw new Error(`unsupported manifest schemaVersion`)
    // English first: other locales' fallback entries reuse its embeddings.
    const locales = Object.entries(manifest.locales).sort(
      ([a], [b]) => Number(b === 'en-US') - Number(a === 'en-US')
    )
    for (const [locale, { hash, path }] of locales)
      sources.set(locale, {
        hash,
        // The manifest lists absolute URLs (relative ones resolve on the origin).
        load: () => fetchJson<HelpBundle>(new URL(path, origin).toString()),
      })
  }

  for (const [locale, source] of sources) {
    const result: LocaleSummary = {
      status: 'unchanged',
      embedded: 0,
      reused: 0,
      remaining: 0,
    }
    summary.locales[locale] = result
    if (!isLocale(locale)) {
      result.status = 'error'
      result.error = 'unknown locale'
      continue
    }
    try {
      const stored = await env.SYNC_STATE.get<StoredIndex>(
        indexKey(locale),
        'json'
      )
      if (
        !options.force &&
        stored?.bundleHash === source.hash &&
        stored.model === EMBEDDING_MODEL
      )
        continue
      for (const entry of stored?.entries ?? [])
        if (!vectors.has(entry.hash)) vectors.set(entry.hash, entry.vector)

      const bundle = await source.load()
      const invalid = validBundle(bundle, locale)
      if (invalid) throw new Error(invalid)

      const hashed = await Promise.all(
        bundle.entries.map(async (entry) => ({
          entry,
          hash: await hashEntry(entry),
        }))
      )
      const missing = new Map<string, HelpEntry>()
      for (const { entry, hash } of hashed)
        if (!vectors.has(hash)) missing.set(hash, entry)

      if (missing.size > budget && built > 0) {
        result.status = 'deferred'
        result.remaining = missing.size
        summary.remaining += missing.size
        continue
      }

      const batches: [string, HelpEntry][][] = []
      const pending = [...missing]
      for (let i = 0; i < pending.length; i += EMBED_BATCH)
        batches.push(pending.slice(i, i + EMBED_BATCH))
      await pool(batches, async (batch) => {
        const embedded = await withRetry(() =>
          embed(
            env.AI,
            batch.map(([, entry]) => documentText(entry))
          )
        )
        batch.forEach(([hash], i) => vectors.set(hash, embedded[i]))
      })
      budget -= missing.size
      built++

      const entries: StoredEntry[] = hashed.map(({ entry, hash }) =>
        storedEntry(entry, hash, vectors.get(hash)!)
      )
      const index: StoredIndex = {
        version: 1,
        model: EMBEDDING_MODEL,
        bundleHash: source.hash,
        builtAt: new Date().toISOString(),
        entries,
      }
      await env.SYNC_STATE.put(indexKey(locale), JSON.stringify(index))
      result.status = 'synced'
      result.embedded = missing.size
      result.reused = entries.length - missing.size
    } catch (error) {
      result.status = 'error'
      result.error = String(error instanceof Error ? error.message : error)
    }
  }
  return summary
}
