/**
 * Finding links in plain text. Pure (no native imports), for link cards, notes
 * and menus alike.
 */

export type TextSegment =
  | { type: 'text'; text: string }
  /** `text` is the link as written; `url` is it normalized. */
  | { type: 'link'; url: string; text: string }

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

type LinkMatch = { start: number; end: number; url: string; raw: string }

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
    matches.push({
      start,
      end: start + raw.length,
      url: normalizeUrl(raw),
      raw,
    })
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
  for (const { start, end, url, raw } of matchLinks(text)) {
    if (start > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, start) })
    }
    segments.push({ type: 'link', url, text: raw })
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
