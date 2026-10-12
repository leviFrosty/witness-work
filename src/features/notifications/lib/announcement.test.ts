import { describe, expect, it } from 'vitest'

import {
  localizedText,
  parseAnnouncement,
} from '@/features/notifications/lib/announcement'

const device = { platform: 'ios', locale: 'en-us' }

describe('localizedText', () => {
  const text = { en: 'Hello', es: 'Hola', 'pt-br': 'Olá' }

  it('prefers the full locale, then the language, then English', () => {
    expect(localizedText(text, 'pt-br')).toBe('Olá')
    expect(localizedText(text, 'es-es')).toBe('Hola')
    expect(localizedText(text, 'ja-jp')).toBe('Hello')
  })

  it('takes one string for every language', () => {
    expect(localizedText('Hi', 'de-de')).toBe('Hi')
  })

  it('has nothing for blank or missing text', () => {
    expect(localizedText('  ', 'en-us')).toBeUndefined()
    expect(localizedText({ es: 'Hola' }, 'en-us')).toBeUndefined()
    expect(localizedText(42, 'en-us')).toBeUndefined()
  })
})

describe('parseAnnouncement', () => {
  const payload = {
    id: 'android-us',
    tone: 'error',
    title: { en: 'Not yet', es: 'Todavía no' },
    body: { en: 'Sorry for the confusion.' },
  }

  it('reads a payload in the device language', () => {
    expect(
      parseAnnouncement(payload, { platform: 'ios', locale: 'es-es' })
    ).toEqual({
      id: 'android-us',
      tone: 'error',
      title: 'Todavía no',
      body: 'Sorry for the confusion.',
      link: undefined,
    })
  })

  it('reads a payload PostHog left as a JSON string', () => {
    expect(parseAnnouncement(JSON.stringify(payload), device)?.id).toBe(
      'android-us'
    )
    expect(parseAnnouncement('{not json', device)).toBeNull()
  })

  it('needs an id and a title', () => {
    expect(parseAnnouncement({ ...payload, id: '' }, device)).toBeNull()
    expect(parseAnnouncement({ ...payload, title: {} }, device)).toBeNull()
    expect(parseAnnouncement(true, device)).toBeNull()
    expect(parseAnnouncement(undefined, device)).toBeNull()
  })

  it('shows only on the listed platforms', () => {
    const iosOnly = { ...payload, platforms: ['ios'] }
    expect(parseAnnouncement(iosOnly, device)).not.toBeNull()
    expect(
      parseAnnouncement(iosOnly, { platform: 'android', locale: 'en-us' })
    ).toBeNull()
  })

  it('falls back to the accent tone', () => {
    expect(parseAnnouncement({ ...payload, tone: 'loud' }, device)?.tone).toBe(
      'accent'
    )
  })

  it('keeps only https links with a label', () => {
    const link = (url: string, label?: unknown) =>
      parseAnnouncement({ ...payload, link: { url, label } }, device)?.link
    expect(link('https://example.com', { en: 'Learn more' })).toEqual({
      url: 'https://example.com',
      label: 'Learn more',
    })
    expect(link('http://example.com', 'Learn more')).toBeUndefined()
    expect(link('javascript:alert(1)', 'Learn more')).toBeUndefined()
    expect(link('https://example.com')).toBeUndefined()
  })
})
