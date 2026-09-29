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

/** Menu label for sending a report once by `method` (e.g. "Share Report…"). */
export const exportMethodMenuTitle = (method: ReportExportMethod): string => {
  switch (method) {
    case 'hourglass':
      return i18n.t('submitToApp', { app: i18n.t('hourglass') })
    case 'nwpublisher':
      return i18n.t('submitToApp', { app: i18n.t('nwPublisher') })
    case 'share':
      return i18n.t('shareReport')
    case 'copy':
    default:
      return i18n.t('copyReport')
  }
}

/** SF Symbols for export methods in native menus. */
export const exportMethodSymbols = {
  copy: 'doc.on.doc',
  share: 'square.and.arrow.up',
  hourglass: 'hourglass',
  nwpublisher: 'globe',
} as const satisfies Record<ReportExportMethod, string>
