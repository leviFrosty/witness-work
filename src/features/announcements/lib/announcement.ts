import { z } from 'zod'

export const MAX_FEED_BYTES = 256 * 1024
export const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000
export const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000

const localizedContent = z.object({
  bannerText: z.string().trim().min(1).max(180),
  title: z.string().trim().min(1).max(160),
  markdown: z
    .string()
    .min(1)
    .max(12_000)
    .refine((value) => Boolean(value.trim())),
})

const timestamp = z.string().datetime({ offset: true })
export const announcementSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  revision: z.string().min(1).max(100),
  publishedAt: timestamp,
  startsAt: timestamp.optional(),
  expiresAt: timestamp.optional(),
  dismissible: z.boolean(),
  signature: z.boolean(),
  locales: z
    .record(localizedContent)
    .refine(
      (locales) =>
        Object.keys(locales).length <= 18 && Boolean(locales['en-us'])
    ),
})

export const announcementFeedSchema = z.object({
  schemaVersion: z.literal(1),
  announcement: announcementSchema.nullable(),
})

export type Announcement = z.infer<typeof announcementSchema>
export type AnnouncementFeed = z.infer<typeof announcementFeedSchema>

export function announcementContent(
  announcement: Announcement,
  locale: string
) {
  const key = locale.toLowerCase().replaceAll('_', '-')
  // Keep Chinese scripts distinct. Incomplete translations fall back to the
  // English source, never to a potentially different regional/script variant.
  const normalized =
    key === 'zh-tw' ? 'zh-hant-tw' : key === 'zh-cn' ? 'zh-hans-cn' : key
  return announcement.locales[normalized] ?? announcement.locales['en-us']
}

export function isAnnouncementActive(announcement: Announcement, now: number) {
  return (
    (!announcement.startsAt || Date.parse(announcement.startsAt) <= now) &&
    (!announcement.expiresAt || now < Date.parse(announcement.expiresAt))
  )
}

/** Resolve uploaded inline/reference image destinations, leaving URLs alone. */
export function resolveAnnouncementImages(markdown: string, endpoint: string) {
  return markdown.replace(
    /(\]\([ \t]*<?|^[ \t]{0,3}\[[^\]\r\n]+\]:[ \t]*<?)(\/announcements\/images\/[a-f0-9]{64}\.(?:png|jpg|webp))(?=[\s)>])/gm,
    (_match, prefix: string, path: string) =>
      `${prefix}${new URL(path, endpoint).href}`
  )
}

/** Native link handling is opt-in: remote copy cannot invoke app/file URLs. */
export function safeAnnouncementLink(value: string): boolean {
  if (
    [...value].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127
    )
  )
    return false
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'https:' &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password) ||
      (url.protocol === 'mailto:' && /^[^@?]+@[^@?]+/.test(url.pathname))
    )
  } catch {
    return false
  }
}
