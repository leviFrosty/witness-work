import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import useConversations from '@/stores/conversationStore'
import useContacts from '@/stores/contactsStore'
import usePublisher from '@/hooks/usePublisher'
import {
  buildMonthReportData,
  type MonthReportData,
} from '@/features/service-reports/lib/monthReportData'

export type { MonthReportData } from '@/features/service-reports/lib/monthReportData'

const useMonthReportData = (
  month: number | undefined,
  year: number | undefined
): MonthReportData => {
  const {
    overrideCreditLimit,
    customCreditLimitHours,
    reportCommentOverrides,
  } = usePreferences()
  // Report in the role that applied that month (Role History): a month spent
  // as a Regular Publisher still exports as yes/no after becoming a pioneer.
  const { type: publisher, entryMode } = usePublisher(
    month !== undefined && year !== undefined ? { month, year } : undefined
  )
  const { serviceReports } = useServiceReport()
  const { categories } = useCategories()
  const { conversations } = useConversations()
  const { contacts } = useContacts()

  return buildMonthReportData({
    month,
    year,
    publisher,
    entryMode,
    serviceReports,
    categories,
    contacts,
    conversations,
    overrideCreditLimit,
    customCreditLimitHours,
    reportCommentOverrides,
  })
}

export default useMonthReportData
