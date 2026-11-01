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
