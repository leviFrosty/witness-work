import i18n from '@/lib/locales'
import type { ReportExportMethod } from '@/stores/preferences'

/** Label for the one-tap submit action of a given method. */
export const getSubmitCtaLabel = (method: ReportExportMethod): string => {
  switch (method) {
    case 'hourglass':
      return i18n.t('submitToApp', { app: i18n.t('hourglass') })
    case 'nwpublisher':
      return i18n.t('submitToApp', { app: i18n.t('nwPublisher') })
    case 'share':
      return i18n.t('share')
    case 'copy':
    default:
      return i18n.t('copyToClipboard')
  }
}
