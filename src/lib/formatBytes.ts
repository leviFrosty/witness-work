import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'

/**
 * A file or blob size for people: `512 B`, `12.3 KB`, `1.25 MB`, `1.5 GB`.
 * Gigabytes are decimal, as storage plans count them: 2,000,000,000 bytes is `2
 * GB`.
 */
export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) return '—'
  const fixed = (value: number, digits: number) =>
    formatNumber(value, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  if (bytes < 1024)
    return i18n.t('fileSize_bytes', { value: formatNumber(bytes) })
  if (bytes < 1024 * 1024)
    return i18n.t('fileSize_kilobytes', { value: fixed(bytes / 1024, 1) })
  if (bytes >= 1_000_000_000)
    return i18n.t('fileSize_gigabytes', {
      value: formatNumber(bytes / 1_000_000_000, {
        maximumFractionDigits: 2,
      }),
    })
  return i18n.t('fileSize_megabytes', {
    value: fixed(bytes / (1024 * 1024), 2),
  })
}
