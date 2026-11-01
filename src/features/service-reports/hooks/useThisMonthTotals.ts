import moment from 'moment'
import { useShallow } from 'zustand/react/shallow'
import useLocalDay from '@/hooks/useLocalDay'
import usePublisher from '@/hooks/usePublisher'
import { getStudiesForGivenMonth } from '@/lib/contacts'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'

export function useThisMonthMinutes() {
  const { type: publisher } = usePublisher()
  const { overrideCreditLimit, customCreditLimitHours } = usePreferences(
    useShallow((s) => ({
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
    }))
  )
  const { serviceReports } = useServiceReport()

  const today = moment(useLocalDay(), 'YYYY-MM-DD')
  const month = today.month()
  const year = today.year()

  return adjustedMinutesForSpecificMonth(
    getMonthsReports(serviceReports, month, year),
    month,
    year,
    publisher,
    {
      enabled: overrideCreditLimit,
      customLimitHours: customCreditLimitHours,
    }
  ).value
}

export function useThisMonthStudies() {
  const contacts = useContacts((s) => s.contacts)
  const conversations = useConversations((s) => s.conversations)

  const month = moment(useLocalDay(), 'YYYY-MM-DD').toDate()
  return getStudiesForGivenMonth({ contacts, conversations, month })
}
