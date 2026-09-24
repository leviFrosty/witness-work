import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => ({
  mmkvStorage: {
    getString: () => undefined,
    set: () => {},
    delete: () => {},
  },
}))

import {
  findLinks,
  getHostname,
  parseOpenGraph,
  resolveUrl,
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
