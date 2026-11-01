import type { NotificationTone } from '@/types/notifications'

export type Announcement = {
  id: string
  tone: NotificationTone
  title: string
  body?: string
  link?: { url: string; label: string }
}

const TONES: NotificationTone[] = ['accent', 'warn', 'error']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function localizedText(
  text: unknown,
  locale: string
): string | undefined {
  if (typeof text === 'string') return text.trim() || undefined
  if (!isRecord(text)) return undefined
  const lower = locale.toLowerCase()
  const candidates = [lower, lower.split('-')[0], 'en', 'en-us']
  for (const key of candidates) {
    const value = text[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

export function parseAnnouncement(
  payload: unknown,
  { platform, locale }: { platform: string; locale: string }
): Announcement | null {
  let value = payload
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!isRecord(value)) return null

  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const title = localizedText(value.title, locale)
  if (!id || !title) return null

  if (Array.isArray(value.platforms) && !value.platforms.includes(platform))
    return null

  const tone = TONES.includes(value.tone as NotificationTone)
    ? (value.tone as NotificationTone)
    : 'accent'

  let link: Announcement['link']
  if (isRecord(value.link) && typeof value.link.url === 'string') {
    const label = localizedText(value.link.label, locale)
    if (/^https:\/\//.test(value.link.url) && label)
      link = { url: value.link.url, label }
  }

  return {
    id,
    tone,
    title,
    body: localizedText(value.body, locale),
    link,
  }
}
