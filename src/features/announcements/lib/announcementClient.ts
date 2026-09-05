import {
  announcementFeedSchema,
  isAnnouncementActive,
  MAX_CACHE_AGE_MS,
  MAX_FEED_BYTES,
  REFRESH_AFTER_MS,
  type AnnouncementFeed,
} from '@/features/announcements/lib/announcement'

interface Storage {
  getString(key: string): string | undefined
  set(key: string, value: string): void
}

interface CachedFeed {
  feed: AnnouncementFeed
  checkedAt: number
  etag?: string
}

/** One launch snapshot, one optional request, and a bounded offline cache. */
export function createAnnouncementClient({
  endpoint,
  storage,
  fetch: fetchFeed = fetch,
  now = Date.now,
}: {
  endpoint: string
  storage: Storage
  fetch?: typeof fetch
  now?: () => number
}) {
  // Namespace by endpoint so changing between development and production never
  // displays content from the other environment.
  const cacheKey = `announcements:v1:${endpoint}`
  const dismissKey = `${cacheKey}:dismissed`
  let didCheck = false
  let launchCache: CachedFeed | null | undefined

  function readCache(): CachedFeed | null {
    try {
      const raw = storage.getString(cacheKey)
      if (!raw || raw.length > MAX_FEED_BYTES + 1024) return null
      const value = JSON.parse(raw)
      const parsed = announcementFeedSchema.safeParse(value.feed)
      if (!parsed.success || !Number.isFinite(value.checkedAt)) return null
      if (
        value.checkedAt > now() ||
        now() - value.checkedAt >= MAX_CACHE_AGE_MS
      )
        return null
      return {
        feed: parsed.data,
        checkedAt: value.checkedAt,
        etag:
          typeof value.etag === 'string' && value.etag.length < 200
            ? value.etag
            : undefined,
      }
    } catch {
      return null
    }
  }

  function dismissedIds(): string[] {
    try {
      const value = JSON.parse(storage.getString(dismissKey) ?? '[]')
      return Array.isArray(value)
        ? value.filter((id) => typeof id === 'string').slice(-100)
        : []
    } catch {
      return []
    }
  }

  function getLaunchAnnouncement() {
    if (launchCache === undefined) launchCache = readCache()
    if (!launchCache || now() - launchCache.checkedAt >= MAX_CACHE_AGE_MS)
      return null
    const announcement = launchCache.feed.announcement
    if (
      !announcement ||
      !isAnnouncementActive(announcement, now()) ||
      dismissedIds().includes(announcement.id)
    )
      return null
    return announcement
  }

  function dismiss(id: string) {
    try {
      storage.set(
        dismissKey,
        JSON.stringify(
          [...dismissedIds().filter((value) => value !== id), id].slice(-100)
        )
      )
    } catch {
      // The component still hides it for this session if storage is unavailable.
    }
  }

  async function checkForUpdates(signal?: AbortSignal): Promise<void> {
    if (didCheck || signal?.aborted) return
    didCheck = true
    // Freeze before writing, even when Home hasn't mounted yet (deep link or
    // another default tab). Late responses can never insert a banner this run.
    getLaunchAnnouncement()
    const cached = readCache()
    if (cached && now() - cached.checkedAt < REFRESH_AFTER_MS) return

    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(abort, 5_000)
    try {
      const response = await fetchFeed(endpoint, {
        signal: controller.signal,
        credentials: 'omit',
        headers: cached?.etag ? { 'If-None-Match': cached.etag } : undefined,
      })
      if (controller.signal.aborted) return
      if (response.status === 304 && cached) {
        storage.set(cacheKey, JSON.stringify({ ...cached, checkedAt: now() }))
        return
      }
      if (
        !response.ok ||
        Number(response.headers.get('Content-Length')) > MAX_FEED_BYTES
      )
        return
      if (!response.headers.get('Content-Type')?.includes('application/json'))
        return
      const raw = await response.text()
      if (
        controller.signal.aborted ||
        raw.length > MAX_FEED_BYTES ||
        new TextEncoder().encode(raw).byteLength > MAX_FEED_BYTES
      )
        return
      const parsed = announcementFeedSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) return
      storage.set(
        cacheKey,
        JSON.stringify({
          feed: parsed.data,
          checkedAt: now(),
          etag: response.headers.get('ETag') ?? undefined,
        })
      )
    } catch {
      // Informational only: no retries, alerts, loading UI, or error reporting
      // for offline, timeout, malformed remote data, or local storage failures.
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  }

  return { getLaunchAnnouncement, dismiss, checkForUpdates }
}
