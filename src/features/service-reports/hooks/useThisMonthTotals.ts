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

/** This month's reportable time, after the Credit Time cap, in minutes. */
export function useThisMonthMinutes() {
  const { type: publisher } = usePublisher()
  const { overrideCreditLimit, customCreditLimitHours } = usePreferences(
    useShallow((s) => ({
      overrideCreditLimit: s.overrideCreditLimit,
      customCreditLimitHours: s.customCreditLimitHours,
    }))
  )
  const { serviceReports } = useServiceReport()
  // Keyed on the day, so the total starts over at midnight on the 1st, also on
  // a Home that stayed open.
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

/** This month's Bible studies: each contact with a study visit counts once. */
export function useThisMonthStudies() {
  const contacts = useContacts((s) => s.contacts)
  const conversations = useConversations((s) => s.conversations)
  // Keyed on the day, like the minutes above.
  const month = moment(useLocalDay(), 'YYYY-MM-DD').toDate()
  return getStudiesForGivenMonth({ contacts, conversations, month })
}
