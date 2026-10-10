import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => new Map<string, string>())
const getString = vi.hoisted(() => vi.fn((key: string) => store.get(key)))
vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: {
    getString,
    set: (key: string, value: string) => store.set(key, value),
    delete: (key: string) => store.delete(key),
  },
}))

import {
  clearLinkPreviewMemoryCache,
  fetchLinkPreview,
  getCachedLinkPreview,
  findLinks,
  getHostname,
  noteTextAroundCards,
  parseOpenGraph,
  resolveUrl,
  splitNoteForCards,
  splitTextWithLinks,
} from '@/lib/linkPreview'

describe('findLinks', () => {
  it('returns an empty list for text without links', () => {
    expect(findLinks('Meet at the hall at 9')).toEqual([])
  })

  it('extracts http and https links in order', () => {
    expect(
      findLinks('See https://jw.org/en/ and http://example.com/a?b=1#c too')
    ).toEqual(['https://jw.org/en/', 'http://example.com/a?b=1#c'])
  })

  it('normalizes bare www hosts to https', () => {
    expect(findLinks('Go to www.example.com/path now')).toEqual([
      'https://www.example.com/path',
    ])
  })

  it('dedupes repeated links', () => {
    expect(
      findLinks('https://a.com/x and again https://a.com/x, then www.a.com')
    ).toEqual(['https://a.com/x', 'https://www.a.com'])
  })

  it.each([
    ['Check https://a.com/x.', 'https://a.com/x'],
    ['Check https://a.com/x,', 'https://a.com/x'],
    ['Check https://a.com/x!', 'https://a.com/x'],
    ['Check https://a.com/x?', 'https://a.com/x'],
    ['(see https://a.com/x)', 'https://a.com/x'],
    ['(see https://a.com/x).', 'https://a.com/x'],
    ['"https://a.com/x"', 'https://a.com/x'],
  ])('trims trailing punctuation from %s', (text, expected) => {
    expect(findLinks(text)).toEqual([expected])
  })

  it('keeps balanced parentheses inside the URL', () => {
    expect(findLinks('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
      'https://en.wikipedia.org/wiki/Foo_(bar)',
    ])
  })

  it('ignores www inside other words and emails', () => {
    expect(findLinks('foo.www.bar and me@www.example.com')).toEqual([])
  })

  it('ignores a bare scheme or non-http schemes', () => {
    expect(findLinks('https:// ftp://x.com mailto:a@b.com')).toEqual([])
  })

  it('finds links across newlines', () => {
    expect(findLinks('Line one\nhttps://a.com\nwww.b.org')).toEqual([
      'https://a.com',
      'https://www.b.org',
    ])
  })
})

describe('splitTextWithLinks', () => {
  it('returns a single text segment when there are no links', () => {
    expect(splitTextWithLinks('Just a note')).toEqual([
      { type: 'text', text: 'Just a note' },
    ])
  })

  it('returns no segments for empty text', () => {
    expect(splitTextWithLinks('')).toEqual([])
  })

  it('interleaves text and link segments, keeping trimmed punctuation', () => {
    expect(splitTextWithLinks('Read https://a.com/x. Then www.b.com')).toEqual([
      { type: 'text', text: 'Read ' },
      { type: 'link', url: 'https://a.com/x' },
      { type: 'text', text: '. Then ' },
      { type: 'link', url: 'https://www.b.com' },
    ])
  })

  it('keeps duplicate links as separate segments', () => {
    expect(splitTextWithLinks('https://a.com https://a.com')).toEqual([
      { type: 'link', url: 'https://a.com' },
      { type: 'text', text: ' ' },
      { type: 'link', url: 'https://a.com' },
    ])
  })
})

describe('splitNoteForCards', () => {
  it('keeps a note without links as one text part', () => {
    expect(splitNoteForCards('Bring tracts')).toEqual({
      cardUrls: [],
      parts: [{ type: 'text', text: 'Bring tracts' }],
    })
  })

  it('lifts the first three links into cards and keeps the rest inline', () => {
    const { cardUrls, parts } = splitNoteForCards(
      'Read https://a.com then https://b.com, https://c.com and https://d.com'
    )
    expect(cardUrls).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ])
    expect(parts).toEqual([
      { type: 'text', text: 'Read then , and ' },
      { type: 'link', url: 'https://d.com' },
    ])
  })
})

describe('noteTextAroundCards', () => {
  it('returns the text shown above the cards', () => {
    expect(
      noteTextAroundCards(
        'Meet at the cart.\nhttps://jw.org/en/\n\nBring tracts'
      )
    ).toBe('Meet at the cart.\n\nBring tracts')
  })

  it('is empty when the note is only links', () => {
    expect(noteTextAroundCards(' https://jw.org/en/ ')).toBe('')
  })
})

describe('parseOpenGraph', () => {
  const pageUrl = 'https://example.com/articles/one.html'

  it('reads OpenGraph tags', () => {
    const html = `<html><head>
      <meta property="og:title" content="Hello &amp; welcome">
      <meta property="og:description" content='A &quot;great&quot; page'>
      <meta property="og:image" content="https://cdn.example.com/i.png">
      <meta property="og:site_name" content="Example">
      <title>Ignored</title>
    </head><body></body></html>`
    expect(parseOpenGraph(html, pageUrl)).toEqual({
      title: 'Hello & welcome',
      description: 'A "great" page',
      imageUrl: 'https://cdn.example.com/i.png',
      siteName: 'Example',
    })
  })

  it('handles content before property and unquoted attributes', () => {
    const html = `<meta content="Reversed" property=og:title />`
    expect(parseOpenGraph(html, pageUrl).title).toBe('Reversed')
  })

  it('falls back to twitter tags, then <title>', () => {
    const twitter = `<meta name="twitter:title" content="Tweet title">
      <meta name="twitter:image" content="/t.png">
      <title>Doc title</title>`
    expect(parseOpenGraph(twitter, pageUrl)).toEqual({
      title: 'Tweet title',
      imageUrl: 'https://example.com/t.png',
    })

    expect(
      parseOpenGraph(
        '<title>\n  Doc &#8211; title &#x2019;s\n</title>',
        pageUrl
      )
    ).toEqual({ title: 'Doc – title ’s' })
  })

  it('uses the first occurrence of a tag', () => {
    const html = `<meta property="og:title" content="First">
      <meta property="og:title" content="Second">`
    expect(parseOpenGraph(html, pageUrl).title).toBe('First')
  })

  it('ignores tags after </head>', () => {
    const html = `<head><title>Head</title></head>
      <body><meta property="og:title" content="Body"></body>`
    expect(parseOpenGraph(html, pageUrl).title).toBe('Head')
  })

  it.each([
    ['//cdn.example.com/a.png', 'https://cdn.example.com/a.png'],
    ['/img/a.png', 'https://example.com/img/a.png'],
    ['img/a.png', 'https://example.com/articles/img/a.png'],
    ['../img/a.png', 'https://example.com/img/a.png'],
    ['a.png?x=1&amp;y=2', 'https://example.com/articles/a.png?x=1&y=2'],
  ])('resolves relative image %s', (src, expected) => {
    const html = `<meta property="og:image" content="${src}">`
    expect(parseOpenGraph(html, pageUrl).imageUrl).toBe(expected)
  })

  it('drops non-http images', () => {
    const html = `<meta property="og:image" content="data:image/png;base64,AAAA">`
    expect(parseOpenGraph(html, pageUrl).imageUrl).toBeUndefined()
  })

  it('caps long strings and collapses whitespace', () => {
    const long = 'word '.repeat(200)
    const html = `<meta property="og:title" content="${long}">
      <meta property="og:description" content="${long}">`
    const preview = parseOpenGraph(html, pageUrl)
    expect(preview.title!.length).toBeLessThanOrEqual(200)
    expect(preview.title!.endsWith('…')).toBe(true)
    expect(preview.description!.length).toBeLessThanOrEqual(300)
    expect(preview.title).not.toMatch(/\s{2}/)
  })

  it('returns an empty object when there is no metadata', () => {
    expect(parseOpenGraph('<html><body>Hi</body></html>', pageUrl)).toEqual({})
  })
})

describe('resolveUrl', () => {
  it('keeps absolute http urls and rejects other schemes', () => {
    expect(resolveUrl('http://a.com/x', 'https://b.com')).toBe('http://a.com/x')
    expect(resolveUrl('javascript:alert(1)', 'https://b.com')).toBeUndefined()
  })

  it('resolves against a host-only base', () => {
    expect(resolveUrl('x.png', 'https://b.com')).toBe('https://b.com/x.png')
  })
})

describe('getHostname', () => {
  it('strips www and lowercases', () => {
    expect(getHostname('https://WWW.Example.com:8080/a')).toBe('example.com')
  })
})

describe('fetchLinkPreview caching', () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const html = '<head><meta property="og:title" content="Example"></head>'

  beforeEach(() => {
    store.clear()
    clearLinkPreviewMemoryCache()
    fetchMock.mockReset()
    getString.mockClear()
    vi.useRealTimers()
  })

  it('caches a 503 for five minutes, not a day', async () => {
    vi.useFakeTimers({ now: 0, toFake: ['Date'] })
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
    await expect(fetchLinkPreview('https://a.test/1')).resolves.toBeNull()
    expect(getCachedLinkPreview('https://a.test/1')).toEqual({ preview: null })
    vi.setSystemTime(5 * 60 * 1000 + 1)
    expect(getCachedLinkPreview('https://a.test/1')).toBeUndefined()
  })

  it('caches a 404 for a day', async () => {
    vi.useFakeTimers({ now: 0, toFake: ['Date'] })
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }))
    await fetchLinkPreview('https://a.test/2')
    vi.setSystemTime(60 * 60 * 1000)
    expect(getCachedLinkPreview('https://a.test/2')).toEqual({ preview: null })
  })

  it('does not cache a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'))
    await expect(fetchLinkPreview('https://a.test/3')).resolves.toBeNull()
    expect(getCachedLinkPreview('https://a.test/3')).toBeUndefined()
  })

  it('parses a stored entry once', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(html, { headers: { 'content-type': 'text/html' } })
    )
    await fetchLinkPreview('https://a.test/4')
    clearLinkPreviewMemoryCache()
    getString.mockClear()
    for (let i = 0; i < 3; i++) {
      expect(getCachedLinkPreview('https://a.test/4')?.preview?.title).toBe(
        'Example'
      )
    }
    expect(getString).toHaveBeenCalledTimes(1)
  })
})
