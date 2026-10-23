import { useMemo } from 'react'
import moment from 'moment'
import { useShallow } from 'zustand/react/shallow'
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
  const now = moment()

  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, now.month(), now.year()),
    [now, serviceReports]
  )
  return useMemo(
    () =>
      adjustedMinutesForSpecificMonth(
        monthReports,
        now.month(),
        now.year(),
        publisher,
        {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        }
      ).value,
    [customCreditLimitHours, monthReports, now, overrideCreditLimit, publisher]
  )
}

/** This month's Bible studies: each contact with a study visit counts once. */
export function useThisMonthStudies() {
  const contacts = useContacts((s) => s.contacts)
  const conversations = useConversations((s) => s.conversations)
  return useMemo(
    () =>
      getStudiesForGivenMonth({ contacts, conversations, month: new Date() }),
    [contacts, conversations]
  )
}
