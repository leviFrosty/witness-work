import { useToastController } from '@tamagui/toast'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import useServiceReport from '@/stores/serviceReport'

/** Where a Service Year's time was deleted from, for analytics. */
export type DeleteServiceYearSource = 'year_row_menu' | 'service_history'

/**
 * Confirms, then deletes every Time Entry in one Service Year — from the
 * Progress → All-time year row menu or the Service History editor.
 */
const useConfirmDeleteServiceYear = () => {
  const toast = useToastController()

  return ({
    endYear,
    source,
    onDeleted,
  }: {
    /** End year of the Service Year (Sep `endYear - 1` → Aug `endYear`). */
    endYear: number
    source: DeleteServiceYearSource
    onDeleted?: () => void
  }) => {
    const label = `${endYear - 1}—${String(endYear % 100).padStart(2, '0')}`
    confirmDestructive({
      title: i18n.t('deleteYearTime_title', { year: label }),
      description: i18n.t('deleteYearTime_description', { year: label }),
      onConfirm: () => {
        useServiceReport.getState().deleteServiceYearReports(endYear)
        analytics.capture('service_year_time_deleted', { source })
        toast.show(i18n.t('success'), {
          message: i18n.t('deleted'),
          native: true,
        })
        onDeleted?.()
      },
    })
  }
}

export default useConfirmDeleteServiceYear
