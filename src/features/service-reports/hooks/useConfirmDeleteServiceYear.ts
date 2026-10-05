import { useToastController } from '@tamagui/toast'

import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import useServiceReport from '@/stores/serviceReport'

/**
 * Confirms, then deletes every Time Entry in one Service Year — from the
 * Progress → All-time year row menu or the Service History editor.
 */
const useConfirmDeleteServiceYear = () => {
  const toast = useToastController()

  return ({
    endYear,
    onDeleted,
  }: {
    /** End year of the Service Year (Sep `endYear - 1` → Aug `endYear`). */
    endYear: number
    onDeleted?: () => void
  }) => {
    const label = `${endYear - 1}—${String(endYear % 100).padStart(2, '0')}`
    confirmDestructive({
      title: i18n.t('deleteYearTime_title', { year: label }),
      description: i18n.t('deleteYearTime_description', { year: label }),
      onConfirm: () => {
        useServiceReport.getState().deleteServiceYearReports(endYear)

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
