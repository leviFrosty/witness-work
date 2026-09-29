import AuxiliaryMonthSheetHost from '@/features/service-reports/components/AuxiliaryMonthSheetHost'
import SupporterSurveyHost from '@/features/supporter/components/SupporterSurveyHost'

/**
 * What notifications tray actions open in place on Home, rather than
 * navigating: the auxiliary pioneering sheet and the feedback survey. The
 * survey host also finds the invitation the tray lists.
 */
export default function NotificationHosts() {
  return (
    <>
      <AuxiliaryMonthSheetHost />
      <SupporterSurveyHost />
    </>
  )
}
