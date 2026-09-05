import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnnouncementClient } from '@/features/announcements/lib/announcementClient'
import {
  announcementContent,
  safeAnnouncementLink,
  resolveAnnouncementImages,
  type AnnouncementFeed,
  REFRESH_AFTER_MS,
  MAX_CACHE_AGE_MS,
} from '@/features/announcements/lib/announcement'

const endpoint = 'https://example.com/announcements/current.json'
const now = Date.parse('2026-09-05T12:00:00Z')
const key = `announcements:v1:${endpoint}`
const sample: AnnouncementFeed = {
  schemaVersion: 1,
  announcement: {
    id: 'qa-help',
    revision: 'a5752953-d94e-45f0-8bca-cf7e7f00b1c8',
    publishedAt: '2026-09-04T12:00:00Z',
    dismissible: true,
    signature: true,
    locales: {
      'en-us': {
        bannerText: 'Looking for QA help',
        title: 'Help test WitnessWork',
        markdown: '[Email Levi](mailto:levi@example.com)',
      },
    },
  },
}
function setup(cached?: { feed?: AnnouncementFeed; age?: number }) {
  const values = new Map<string, string>()
  if (cached)
    values.set(
      key,
      JSON.stringify({
        feed: cached.feed ?? sample,
        checkedAt: now - (cached.age ?? 0),
        etag: '"version-one"',
      })
    )
  const storage = {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value)
    },
  }
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(sample, { headers: { ETag: '"version-two"' } })
    )
  const create = () =>
    createAnnouncementClient({
      endpoint,
      storage,
      fetch: fetcher,
      now: () => Date.now(),
    })
  vi.spyOn(Date, 'now').mockReturnValue(now)
  return { client: create(), create, values, fetcher, storage }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('announcement launch/cache contract', () => {
  it('fetches once and makes a first download visible on the next launch only', async () => {
    const { client, create, fetcher } = setup()
    await client.checkForUpdates()
    await client.checkForUpdates()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(client.getLaunchAnnouncement()).toBeNull()
    expect(create().getLaunchAnnouncement()?.id).toBe('qa-help')
  })
  it('shows a fresh cached item with no network request', async () => {
    const { client, fetcher } = setup({})
    expect(client.getLaunchAnnouncement()?.id).toBe('qa-help')
    await client.checkForUpdates()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('revalidates an older cache with ETag and preserves the launch snapshot', async () => {
    const { client, fetcher, values } = setup({ age: REFRESH_AFTER_MS })
    fetcher.mockResolvedValue(new Response(null, { status: 304 }))
    await client.checkForUpdates()
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: 'omit',
      headers: { 'If-None-Match': '"version-one"' },
    })
    expect(JSON.parse(values.get(key)!).checkedAt).toBe(now)
    expect(client.getLaunchAnnouncement()?.id).toBe('qa-help')
  })
  it('withdraws next launch without removing content while someone reads it', async () => {
    const { client, create, fetcher } = setup({ age: REFRESH_AFTER_MS })
    fetcher.mockResolvedValue(
      Response.json({ schemaVersion: 1, announcement: null })
    )
    await client.checkForUpdates()
    expect(client.getLaunchAnnouncement()?.id).toBe('qa-help')
    expect(create().getLaunchAnnouncement()).toBeNull()
  })
  it('does not keep offline announcements indefinitely or send an expired ETag', async () => {
    const { client, fetcher } = setup({ age: MAX_CACHE_AGE_MS })
    expect(client.getLaunchAnnouncement()).toBeNull()
    await client.checkForUpdates()
    expect(fetcher.mock.calls[0][1]?.headers).toBeUndefined()
  })
  it('ignores future cache timestamps after a clock correction', async () => {
    const { client, fetcher } = setup({ age: -1000 })
    expect(client.getLaunchAnnouncement()).toBeNull()
    await client.checkForUpdates()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([
    () => new Response('unavailable', { status: 503 }),
    () =>
      new Response('not json', {
        headers: { 'Content-Type': 'application/json' },
      }),
    () => Response.json({ schemaVersion: 2, announcement: null }),
    () => Response.json({ schemaVersion: 1, announcement: { id: 'bad' } }),
    () => new Response('<html>portal</html>'),
  ])(
    'preserves the bounded cache when the service returns invalid data',
    async (response) => {
      const { client, values, fetcher } = setup({ age: REFRESH_AFTER_MS })
      const before = values.get(key)
      fetcher.mockResolvedValue(response())
      await client.checkForUpdates()
      expect(values.get(key)).toBe(before)
      expect(client.getLaunchAnnouncement()?.id).toBe('qa-help')
    }
  )
  it('does not retry offline failures', async () => {
    const { client, fetcher } = setup()
    fetcher.mockRejectedValue(new TypeError('Network request failed'))
    await expect(client.checkForUpdates()).resolves.toBeUndefined()
    await client.checkForUpdates()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('aborts a slow request after five seconds', async () => {
    vi.useFakeTimers()
    const { client, fetcher } = setup()
    fetcher.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted'))
          )
        })
    )
    const request = client.checkForUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await expect(request).resolves.toBeUndefined()
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })
  it('cancels pending reads when the app backgrounds and ignores late data', async () => {
    const { client, values, fetcher } = setup()
    let resolve!: (response: Response) => void
    fetcher.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const controller = new AbortController()
    const request = client.checkForUpdates(controller.signal)
    controller.abort()
    resolve(Response.json(sample))
    await request
    expect(values.size).toBe(0)
  })
  it('persists dismissal by identity across edits but displays a new identity', () => {
    const { client, create, values } = setup({})
    client.dismiss('qa-help')
    expect(create().getLaunchAnnouncement()).toBeNull()
    const feed = structuredClone(sample)
    feed.announcement!.revision = 'c8852953-d94e-45f0-8bca-cf7e7f00b1c8'
    values.set(key, JSON.stringify({ feed, checkedAt: now }))
    expect(create().getLaunchAnnouncement()).toBeNull()
    feed.announcement!.id = 'happy-service-year'
    values.set(key, JSON.stringify({ feed, checkedAt: now }))
    expect(create().getLaunchAnnouncement()?.id).toBe('happy-service-year')
  })
  it('honors start and expiration even while offline', () => {
    const feed = structuredClone(sample)
    feed.announcement!.startsAt = '2026-09-06T00:00:00Z'
    expect(setup({ feed }).client.getLaunchAnnouncement()).toBeNull()
    feed.announcement!.startsAt = '2026-09-04T00:00:00Z'
    feed.announcement!.expiresAt = '2026-09-05T12:00:00Z'
    expect(setup({ feed }).client.getLaunchAnnouncement()).toBeNull()
  })
  it('isolates development and production caches', () => {
    const { storage } = setup({})
    const dev = createAnnouncementClient({
      endpoint: 'http://localhost:8787/announcements/current.json',
      storage,
    })
    expect(dev.getLaunchAnnouncement()).toBeNull()
  })
})

describe('localized content and links', () => {
  it('resolves inline and reference images without rewriting absolute links', () => {
    const path = `/announcements/images/${'a'.repeat(64)}.png`
    const markdown = `![Photo](${path})\n![Photo][picture]\n[picture]: <${path}>\n[Link](https://example.org${path})`
    const resolved = resolveAnnouncementImages(markdown, endpoint)
    expect(resolved).toContain(`![Photo](https://example.com${path})`)
    expect(resolved).toContain(`[picture]: <https://example.com${path}>`)
    expect(resolved).toContain(`[Link](https://example.org${path})`)
  })
  it('preserves Chinese script choice and falls back to English for missing translations', () => {
    const announcement = structuredClone(sample.announcement!)
    announcement.locales['zh-hant-tw'] = {
      bannerText: '公告',
      title: '公告',
      markdown: '繁體中文',
    }
    expect(announcementContent(announcement, 'zh-TW').markdown).toBe('繁體中文')
    expect(announcementContent(announcement, 'zh-CN')).toEqual(
      announcement.locales['en-us']
    )
    expect(announcementContent(announcement, 'fr-fr')).toEqual(
      announcement.locales['en-us']
    )
  })
  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'witnesswork://import',
    'http://example.com',
    'https://user:password@example.com',
    ' https://example.com',
    'https://example.com\n',
  ])('rejects unsafe link %s', (url) => {
    expect(safeAnnouncementLink(url)).toBe(false)
  })
  it.each([
    'https://example.com/signup?source=app',
    'mailto:levi@example.com?subject=QA%20help',
  ])('allows informational link %s', (url) => {
    expect(safeAnnouncementLink(url)).toBe(true)
  })
})
