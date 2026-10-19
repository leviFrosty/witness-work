/**
 * A link as logs may show it: its scheme, host, and (for web links) first path
 * segment, with the rest marked but never shown. Buddies invites, handoff
 * links, and contact shares carry their secret or payload in the fragment, the
 * path (`witnesswork://import-contact/<payload>`, `/c/<payload>`), or the
 * query, so a log must never print a link whole.
 */
export function redactLink(url: string | null | undefined): string {
  if (url == null) return String(url)
  const match = /^([a-z][a-z\d+.-]*:)(\/\/[^/?#]*)?/i.exec(url)
  if (!match) return '[link]'
  let kept = match[0]
  if (/^https?:$/i.test(match[1]))
    kept += /^\/[^/?#]*/.exec(url.slice(kept.length))?.[0] ?? ''
  const rest = url.slice(kept.length)
  const marks = [
    rest.startsWith('/') ? '/…' : '',
    /^[^#]*\?/.test(rest) ? '?…' : '',
    rest.includes('#') ? '#…' : '',
  ]
  return kept + marks.join('')
}
