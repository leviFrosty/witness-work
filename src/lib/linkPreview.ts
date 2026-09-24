import { mmkvStorage } from '@/stores/mmkv'

export type LinkPreview = {
  title?: string
  description?: string
  imageUrl?: string
  siteName?: string
}

export type TextSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; url: string }

const FETCH_TIMEOUT_MS = 6000
const MAX_BODY_BYTES = 512 * 1024
const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FAILURE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_KEY_PREFIX = 'linkPreview:v1:'

const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 300
const MAX_SITE_NAME_LENGTH = 100
const MAX_URL_LENGTH = 2048

// Mobile Safari UA so sites serve the same OG-tagged HTML they give iPhones.
const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

// ---------------------------------------------------------------------------
// Link detection
// ---------------------------------------------------------------------------

/**
 * `prefix` guards against matching `www.` mid-word (e.g. `foo.www.bar`) or
 * inside an email address. Written without lookbehind for engine portability.
 */
const LINK_PATTERN = /(^|[^\w.@/-])((?:https?:\/\/|www\.)[^\s<>"'`]+)/gi
const TRAILING_PUNCTUATION = /[.,!?;:'"*_\]}>]$/

function trimTrailing(raw: string): string {
  let url = raw
  for (;;) {
    if (TRAILING_PUNCTUATION.test(url)) {
      url = url.slice(0, -1)
      continue
    }
    // Only strip a closing paren when it's unbalanced, so wiki-style
    // `/Foo_(bar)` URLs survive while `(see https://x.com)` doesn't.
    if (url.endsWith(')')) {
      const opens = url.split('(').length - 1
      const closes = url.split(')').length - 1
      if (closes > opens) {
        url = url.slice(0, -1)
        continue
      }
    }
    return url
  }
}

function normalizeUrl(url: string): string {
  return /^www\./i.test(url) ? `https://${url}` : url
}

type LinkMatch = { start: number; end: number; url: string }

function matchLinks(text: string): LinkMatch[] {
  const matches: LinkMatch[] = []
  for (const match of text.matchAll(LINK_PATTERN)) {
    const prefix = match[1] ?? ''
    const raw = trimTrailing(match[2] ?? '')
    // Require something after the scheme / `www.` that looks like a host.
    if (!/^(?:https?:\/\/|www\.)[^\s/?#.]+(?:\.[^\s/?#.]+)*/i.test(raw)) {
      continue
    }
    const start = (match.index ?? 0) + prefix.length
    matches.push({ start, end: start + raw.length, url: normalizeUrl(raw) })
  }
  return matches
}

/** Extracts http(s) and bare `www.` links from `text`, in order, deduped. */
export function findLinks(text: string): string[] {
  const seen = new Set<string>()
  const links: string[] = []
  for (const { url } of matchLinks(text)) {
    if (seen.has(url)) continue
    seen.add(url)
    links.push(url)
  }
  return links
}

/** Splits `text` into alternating text and link segments for rendering. */
export function splitTextWithLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0
  for (const { start, end, url } of matchLinks(text)) {
    if (start > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, start) })
    }
    segments.push({ type: 'link', url })
    cursor = end
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', text: text.slice(cursor) })
  }
  return segments
}

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\/[^\s/?#]+/i.test(url)
}

/** Hostname without a leading `www.`; falls back to the input. */
export function getHostname(url: string): string {
  const match = url.match(/^[a-z][a-z\d+.-]*:\/\/(?:[^@/?#]*@)?([^:/?#]+)/i)
  const host = match?.[1]?.toLowerCase()
  return host ? host.replace(/^www\./, '') : url
}

// ---------------------------------------------------------------------------
// OpenGraph parsing
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, body: string) => {
      if (body[0] === '#') {
        const isHex = body[1] === 'x' || body[1] === 'X'
        const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10)
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
          return entity
        }
        return String.fromCodePoint(code)
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? entity
    }
  )
}

function cleanText(value: string | undefined, maxLength: number) {
  if (!value) return undefined
  const cleaned = decodeHtmlEntities(value).replace(/\s+/g, ' ').trim()
  if (!cleaned) return undefined
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…`
    : cleaned
}

/** Resolves `href` against `base`. Returns undefined for non-http(s) results. */
export function resolveUrl(href: string, base: string): string | undefined {
  const value = href.trim()
  if (!value) return undefined
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    return isHttpUrl(value) ? value : undefined
  }
  const baseMatch = base.match(/^(https?:)\/\/([^/?#]+)([^?#]*)/i)
  if (!baseMatch) return undefined
  const [, protocol, host, basePath] = baseMatch
  if (value.startsWith('//')) return `${protocol}${value}`
  if (value.startsWith('/')) return `${protocol}//${host}${value}`
  if (value.startsWith('?') || value.startsWith('#')) {
    return `${protocol}//${host}${basePath || '/'}${value}`
  }

  const directory = (basePath || '/').replace(/[^/]*$/, '')
  const [pathPart, ...rest] = value.split(/(?=[?#])/)
  const segments: string[] = []
  for (const segment of `${directory}${pathPart}`.split('/')) {
    if (segment === '..') segments.pop()
    else if (segment !== '.') segments.push(segment)
  }
  let path = segments.join('/')
  if (!path.startsWith('/')) path = `/${path}`
  if (/(?:^|\/)\.\.?$/.test(pathPart ?? '') && !path.endsWith('/')) {
    path += '/'
  }
  return `${protocol}//${host}${path}${rest.join('')}`
}

const ATTRIBUTE_PATTERN =
  /([^\s=/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of tag.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1]?.toLowerCase()
    if (!name || name in attributes) continue
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attributes
}

/** Parses OpenGraph (then Twitter card, then `<title>`) metadata from HTML. */
export function parseOpenGraph(html: string, pageUrl: string): LinkPreview {
  const headEnd = html.search(/<\/head\s*>/i)
  const head = headEnd >= 0 ? html.slice(0, headEnd) : html

  const meta: Record<string, string> = {}
  for (const match of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0])
    const key = (attributes.property ?? attributes.name)?.toLowerCase().trim()
    const content = attributes.content
    if (!key || content == null || key in meta) continue
    meta[key] = content
  }

  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]

  const title = cleanText(
    meta['og:title'] || meta['twitter:title'] || titleTag,
    MAX_TITLE_LENGTH
  )
  const description = cleanText(
    meta['og:description'] ||
      meta['twitter:description'] ||
      meta['description'],
    MAX_DESCRIPTION_LENGTH
  )
  const siteName = cleanText(
    meta['og:site_name'] || meta['application-name'],
    MAX_SITE_NAME_LENGTH
  )
  const rawImage =
    meta['og:image:secure_url'] ||
    meta['og:image'] ||
    meta['og:image:url'] ||
    meta['twitter:image'] ||
    meta['twitter:image:src']
  const decodedImage = rawImage ? decodeHtmlEntities(rawImage) : undefined
  const resolvedImage = decodedImage
    ? resolveUrl(decodedImage, pageUrl)
    : undefined
  const imageUrl =
    resolvedImage && resolvedImage.length <= MAX_URL_LENGTH
      ? resolvedImage
      : undefined

  const preview: LinkPreview = {}
  if (title) preview.title = title
  if (description) preview.description = description
  if (imageUrl) preview.imageUrl = imageUrl
  if (siteName) preview.siteName = siteName
  return preview
}

// ---------------------------------------------------------------------------
// Fetching + cache
// ---------------------------------------------------------------------------

type CacheEntry = { fetchedAt: number; preview: LinkPreview | null }

const cacheKey = (url: string) => `${CACHE_KEY_PREFIX}${url}`

/**
 * Returns the cached result for `url` when it's still fresh. `preview: null`
 * means a recent fetch failed; `undefined` means nothing usable is cached.
 */
export function getCachedLinkPreview(
  url: string
): { preview: LinkPreview | null } | undefined {
  let raw: string | undefined
  try {
    raw = mmkvStorage.getString(cacheKey(url))
  } catch {
    return undefined
  }
  if (!raw) return undefined
  try {
    const entry = JSON.parse(raw) as CacheEntry
    const ttl = entry.preview ? SUCCESS_TTL_MS : FAILURE_TTL_MS
    if (typeof entry.fetchedAt !== 'number') return undefined
    if (Date.now() - entry.fetchedAt > ttl) {
      mmkvStorage.delete(cacheKey(url))
      return undefined
    }
    return { preview: entry.preview }
  } catch {
    return undefined
  }
}

function writeCache(url: string, preview: LinkPreview | null) {
  try {
    const entry: CacheEntry = { fetchedAt: Date.now(), preview }
    mmkvStorage.set(cacheKey(url), JSON.stringify(entry))
  } catch {
    // Cache is best-effort.
  }
}

async function readLimitedText(response: Response): Promise<string> {
  const reader = response.body?.getReader?.()
  if (!reader || typeof TextDecoder === 'undefined') {
    const text = await response.text()
    return text.slice(0, MAX_BODY_BYTES)
  }

  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  try {
    while (bytes < MAX_BODY_BYTES) {
      const { done, value } = await reader.read()
      if (done || !value) break
      bytes += value.byteLength
      text += decoder.decode(value, { stream: true })
      // OG tags live in <head>; no need to download the rest of the page.
      if (/<\/head\s*>/i.test(text)) break
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return text.slice(0, MAX_BODY_BYTES)
}

async function requestPreview(url: string): Promise<LinkPreview | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    })
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType && !/html|xml/i.test(contentType)) return null
    const html = await readLimitedText(response)
    const preview = parseOpenGraph(html, response.url || url)
    return preview.title || preview.imageUrl || preview.siteName
      ? preview
      : null
  } finally {
    clearTimeout(timeout)
  }
}

const inFlight = new Map<string, Promise<LinkPreview | null>>()

/**
 * Fetches and caches OpenGraph metadata for `url`. Resolves `null` when the
 * page can't be fetched or has no usable metadata. Never rejects. Non-OK
 * responses and pages without metadata are cached as failures for a day.
 */
export function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  if (!isHttpUrl(url)) return Promise.resolve(null)

  const cached = getCachedLinkPreview(url)
  if (cached) return Promise.resolve(cached.preview)

  const existing = inFlight.get(url)
  if (existing) return existing

  const request = requestPreview(url)
    .then((preview) => {
      writeCache(url, preview)
      return preview
    })
    // Network errors and timeouts are usually transient (offline, flaky
    // signal), so they aren't cached as failures; the next mount retries.
    .catch(() => null)
    .finally(() => {
      inFlight.delete(url)
    })
  inFlight.set(url, request)
  return request
}
