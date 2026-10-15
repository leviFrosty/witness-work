import i18n from '@/lib/locales'

/** A file or blob size for people: `512 B`, `12.3 KB`, `1.25 MB`. */
export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) return '—'
  if (bytes < 1024) return i18n.t('fileSize_bytes', { value: bytes })
  if (bytes < 1024 * 1024)
    return i18n.t('fileSize_kilobytes', { value: (bytes / 1024).toFixed(1) })
  return i18n.t('fileSize_megabytes', {
    value: (bytes / (1024 * 1024)).toFixed(2),
  })
}
