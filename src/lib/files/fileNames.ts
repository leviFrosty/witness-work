/** The longest file name (with its extension) a download carries. */
const MAX_FILE_NAME_LENGTH = 120

/** Characters no file system or browser download accepts in a name. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001f\u007f<>:"/\\|?*]+/g

const lastDot = (name: string) => name.lastIndexOf('.')

/** The lower-case extension of `name`, without its dot; '' when it has none. */
export function fileExtension(name: string): string {
  const dot = lastDot(name)
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * A name safe to hand to a browser's download: no path separators or characters
 * Windows refuses, no leading dots, trimmed to a sensible length with its
 * extension kept. Falls back to `fallback` when nothing is left.
 */
export function downloadFileName(name: string, fallback = 'download'): string {
  const cleaned = name
    .normalize('NFC')
    .replace(FORBIDDEN, '-')
    .replace(/^[\s.-]+/, '')
    .replace(/[\s.-]+$/, '')
  if (!cleaned) return fallback
  if (cleaned.length <= MAX_FILE_NAME_LENGTH) return cleaned
  const extension = fileExtension(cleaned)
  const suffix = extension ? `.${extension}` : ''
  // Whole characters only: a cut surrogate pair would download as U+FFFD.
  const stem = Array.from(cleaned.slice(0, cleaned.length - suffix.length))
  while (stem.join('').length > MAX_FILE_NAME_LENGTH - suffix.length) stem.pop()
  return `${stem.join('')}${suffix}`
}
