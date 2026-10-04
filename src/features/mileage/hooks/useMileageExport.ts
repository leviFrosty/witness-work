import { Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { useToastController } from '@tamagui/toast'
import i18n from '@/lib/locales'
import Haptics from '@/lib/haptics'
import { analytics } from '@/lib/analytics'
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
  const toast = useToastController()

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
        toast.show(i18n.t('copied'), { native: true, duration: 2000 })
        analytics.capture('mileage_report_exported', properties)
        return
      }
      if (method === 'share') {
        const result = await Share.share({ message: buildReportText(input) })
        if (result.action === Share.sharedAction)
          analytics.capture('mileage_report_exported', properties)
        return
      }
      if (!(await Sharing.isAvailableAsync())) {
        toast.show(i18n.t('mileage.csvUnavailable'), { native: true })
        analytics.capture('mileage_report_export_failed', {
          ...properties,
          reason: 'sharing_unavailable',
        })
        return
      }
      const uri = `${FileSystem.cacheDirectory}${i18n
        .t('mileage.csvFileName')
        .replace(/[^\w-]+/g, '-')}-${toDateKey(input.period.start)}.csv`
      await FileSystem.writeAsStringAsync(uri, buildReportCsv(input))
      await Sharing.shareAsync(uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: i18n.t('mileage.exportCsv'),
      })
      analytics.capture('mileage_report_exported', properties)
    } catch (error) {
      logger.error('Mileage export failed', error)
      toast.show(i18n.t('mileage.exportFailed'), { native: true })
      analytics.capture('mileage_report_export_failed', {
        ...properties,
        reason: 'error',
      })
    }
  }

  return { exportReport }
}
