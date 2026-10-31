import {
  indexKey,
  loadIndex,
  type LoadedIndex,
  type StoredIndex,
} from './searchIndex'

/**
 * Loaded indexes, per isolate. One older than this is still served while a
 * fresh copy loads in the background, so a sync shows up within a few minutes
 * without any request waiting on KV.
 */
const INDEX_FRESH_MS = 5 * 60_000
const indexes = new Map<string, { index: LoadedIndex; loadedAt: number }>()

async function readIndex(
  kv: KVNamespace,
  locale: string
): Promise<LoadedIndex | null> {
  const stored = await kv.get<StoredIndex>(indexKey(locale), {
    type: 'json',
    cacheTtl: 60,
  })
  if (!stored) return null
  const index = loadIndex(stored)
  indexes.set(locale, { index, loadedAt: Date.now() })
  return index
}

// Only finished indexes are shared between requests, never a pending read:
// a Worker request can't wait on another request's I/O.
export async function getIndex(
  kv: KVNamespace,
  locale: string,
  ctx: ExecutionContext
): Promise<LoadedIndex | null> {
  const cached = indexes.get(locale)
  if (!cached) return readIndex(kv, locale)
  if (Date.now() - cached.loadedAt > INDEX_FRESH_MS) {
    cached.loadedAt = Date.now()
    ctx.waitUntil(
      readIndex(kv, locale).catch((error) =>
        console.error('index refresh failed', locale, String(error))
      )
    )
  }
  return cached.index
}

/** Forgets loaded indexes (tests). */
export const clearIndexes = () => indexes.clear()
