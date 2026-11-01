import * as Notifications from 'expo-notifications'
import moment from 'moment'
import { toast } from '@/stores/toasts'

import { formatDate, formatTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'

export type DismissOption = {
  key: string
  duration: number
  unit: 'seconds' | 'minutes' | 'days' | 'weeks' | 'months' | 'years'
  label: string
  example: string
  isTestOption?: boolean
}

export const dismissOptions: DismissOption[] = [
  {
    key: '1_week',
    duration: 1,
    unit: 'weeks',
    label: 'dismissFor1Week',
    example: 'dismissExample',
  },
  {
    key: '1_month',
    duration: 1,
    unit: 'months',
    label: 'dismissFor1Month',
    example: 'dismissExample',
  },
  {
    key: '3_months',
    duration: 3,
    unit: 'months',
    label: 'dismissFor3Months',
    example: 'dismissExample',
  },
  {
    key: '6_months',
    duration: 6,
    unit: 'months',
    label: 'dismissFor6Months',
    example: 'dismissExample',
  },
  {
    key: '1_year',
    duration: 1,
    unit: 'years',
    label: 'dismissFor1Year',
    example: 'dismissExample',
  },
]

export const notNowDismissOption: DismissOption = {
  key: 'not_now',
  duration: 30,
  unit: 'days',
  label: 'notNow',
  example: 'dismissExample',
}

export const testDismissOptions: DismissOption[] = [
  {
    key: '10_seconds',
    duration: 10,
    unit: 'seconds',
    label: '10 Seconds',
    example: 'Until {date}',
    isTestOption: true,
  },
  {
    key: '1_minute',
    duration: 1,
    unit: 'minutes',
    label: '1 Minute',
    example: 'Until {date}',
    isTestOption: true,
  },
  {
    key: '5_minutes',
    duration: 5,
    unit: 'minutes',
    label: '5 Minutes',
    example: 'Until {date}',
    isTestOption: true,
  },
]

export const dismissOptionLabel = (option: DismissOption) =>
  option.isTestOption ? option.label : i18n.t(option.label as 'dismissFor1Week')

const reminderWillSend = (
  dismissedUntil: Date,
  notificationsAllowed: boolean
) => notificationsAllowed && moment(dismissedUntil).isAfter(moment())

const dismissedUntilFor = (option: DismissOption) =>
  moment().add(option.duration, option.unit).toDate()

const formatUntil = (option: DismissOption, dismissedUntil: Date) =>
  option.unit === 'seconds' || option.unit === 'minutes'
    ? formatTime(dismissedUntil, { withSeconds: true })
    : formatDate(dismissedUntil, { style: 'medium' })

const notificationsAllowed = async () =>
  (await Notifications.getPermissionsAsync()).granted

export default function useDismissContact() {
  return async (contact: Contact, option: DismissOption) => {
    const dismissedUntil = dismissedUntilFor(option)
    const reminder = reminderWillSend(
      dismissedUntil,
      await notificationsAllowed()
    )
    useContacts.getState().dismissContact(contact.id, dismissedUntil)
    const until = formatUntil(option, dismissedUntil)

    toast.success(i18n.t('contactDismissed'), {
      message: reminder
        ? i18n.t('contactDismissedWithNotificationMessage', {
            name: contact.name,
            until,
          })
        : i18n.t('contactDismissedMessage', { name: contact.name, until }),
    })
  }
}

export function useDismissContacts() {
  return async (contacts: Contact[], option: DismissOption) => {
    if (!contacts.length) return
    const dismissedUntil = dismissedUntilFor(option)

    useContacts
      .getState()
      .dismissContacts(
        contacts.map((contact) => ({ id: contact.id, dismissedUntil }))
      )
    toast.success(i18n.t('contactDismissed'), {
      message: i18n.t('contactsDismissedMessage', {
        count: contacts.length,
        until: formatUntil(option, dismissedUntil),
      }),
    })
  }
}

export function useUndismissContacts() {
  return async (contacts: Contact[]) => {
    if (!contacts.length) return
    useContacts.getState().undismissContacts(contacts.map((c) => c.id))
    toast.success(
      contacts.length === 1
        ? i18n.t('contactUndismissed', { name: contacts[0].name })
        : i18n.t('contactsUndismissed', { count: contacts.length })
    )
  }
}

export function useDismissDurations() {
  const developerTools = usePreferences((s) => s.developerTools)
  return developerTools
    ? [...dismissOptions, ...testDismissOptions]
    : dismissOptions
}
