import { toast } from '@/stores/toasts'

import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import { formatPlainNumber, localizeAppDigits } from '@/lib/numbers'
import useServiceReport from '@/stores/serviceReport'

const useConfirmDeleteServiceYear = () => {
  return ({
    endYear,
    onDeleted,
  }: {
    endYear: number
    onDeleted?: () => void
  }) => {
    const label = i18n.t('scheduleCalendar.serviceYearSpanShort', {
      start: formatPlainNumber(endYear - 1),
      end: localizeAppDigits(String(endYear % 100).padStart(2, '0')),
    })
    confirmDestructive({
      title: i18n.t('deleteYearTime_title', { year: label }),
      description: i18n.t('deleteYearTime_description', { year: label }),
      onConfirm: () => {
        useServiceReport.getState().deleteServiceYearReports(endYear)

        toast.success(i18n.t('success'), {
          message: i18n.t('deleted'),
        })
        onDeleted?.()
      },
    })
  }
}

export default useConfirmDeleteServiceYear
