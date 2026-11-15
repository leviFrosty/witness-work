import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'

export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) return '—'
  if (bytes < 1_000)
    return i18n.t('fileSize_bytes', { value: formatNumber(bytes) })
  if (bytes < 1_000_000)
    return i18n.t('fileSize_kilobytes', {
      value: formatNumber(bytes / 1_000, { maximumFractionDigits: 0 }),
    })
  if (bytes < 1_000_000_000)
    return i18n.t('fileSize_megabytes', {
      value: formatNumber(bytes / 1_000_000, { maximumFractionDigits: 1 }),
    })
  return i18n.t('fileSize_gigabytes', {
    value: formatNumber(bytes / 1_000_000_000, { maximumFractionDigits: 2 }),
  })
}
