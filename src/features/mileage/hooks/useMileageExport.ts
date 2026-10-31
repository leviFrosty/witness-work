import { Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { toast } from '@/stores/toasts'
import i18n from '@/lib/locales'
import Haptics from '@/lib/haptics'
import { analytics } from '@/lib/analytics'
import {
  canExportFiles,
  deliverExport,
  prepareExport,
} from '@/lib/files/exportFile'
import { logger } from '@/lib/logger'
import { toDateKey } from '@/lib/mileage/calc'
import {
  buildReportCsv,
  buildReportText,
  type MileageReportInput,
} from '@/features/mileage/lib/report'

export type MileageExportMethod = 'copy' | 'share' | 'csv'

/** Copy, Share, and Export CSV for a Mileage report. */
export default function useMileageExport() {
  const exportReport = async (
    method: MileageExportMethod,
    input: MileageReportInput
  ) => {
    const properties = {
      method,
      period: input.period.kind,
      trip_count: input.trips.length,
    }
    try {
      if (method === 'copy') {
        await Clipboard.setStringAsync(buildReportText(input))
        Haptics.success().catch(() => {})
        toast.success(i18n.t('copied'), { durationMs: 2000 })
        analytics.capture('mileage_report_exported', properties)
        return
      }
      if (method === 'share') {
        const result = await Share.share({ message: buildReportText(input) })
        if (result.action === Share.sharedAction)
          analytics.capture('mileage_report_exported', properties)
        return
      }
      if (!(await canExportFiles())) {
        toast.error(i18n.t('mileage.csvUnavailable'))
        analytics.capture('mileage_report_export_failed', {
          ...properties,
          reason: 'sharing_unavailable',
        })
        return
      }
      const fileName = `${i18n
        .t('mileage.csvFileName')
        .replace(/[^\w-]+/g, '-')}-${toDateKey(input.period.start)}.csv`
      await deliverExport(
        await prepareExport({
          fileName,
          mimeType: 'text/csv',
          uti: 'public.comma-separated-values-text',
          dialogTitle: i18n.t('mileage.exportCsv'),
          text: buildReportCsv(input),
          purpose: 'save',
        })
      )
      analytics.capture('mileage_report_exported', properties)
    } catch (error) {
      logger.error('Mileage export failed', error)
      toast.error(i18n.t('mileage.exportFailed'))
      analytics.capture('mileage_report_export_failed', {
        ...properties,
        reason: 'error',
      })
    }
  }

  return { exportReport }
}
