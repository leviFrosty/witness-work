const MAX_FILE_NAME_LENGTH = 120

const FORBIDDEN = /[\u0000-\u001f\u007f<>:"/\\|?*]+/g

const lastDot = (name: string) => name.lastIndexOf('.')

export function fileExtension(name: string): string {
  const dot = lastDot(name)
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

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

  const stem = Array.from(cleaned.slice(0, cleaned.length - suffix.length))
  while (stem.join('').length > MAX_FILE_NAME_LENGTH - suffix.length) stem.pop()
  return `${stem.join('')}${suffix}`
}
