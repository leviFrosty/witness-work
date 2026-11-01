import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'

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
  return i18n.t('fileSize_megabytes', {
    value: fixed(bytes / (1024 * 1024), 2),
  })
}
