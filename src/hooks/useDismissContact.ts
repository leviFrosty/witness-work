import * as Notifications from 'expo-notifications'
import moment from 'moment'
import { useToastController } from '@tamagui/toast'

import { analytics } from '@/lib/analytics'
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

/** Localized label for a dismiss duration (test options are dev-only). */
export const dismissOptionLabel = (option: DismissOption) =>
  option.isTestOption ? option.label : i18n.t(option.label as 'dismissFor1Week')

/**
 * Whether a "available again" reminder will go out. `useReconciledReminders`
 * schedules it from `dismissedUntil` (and removes any earlier one).
 */
const reminderWillSend = (
  dismissedUntil: Date,
  notificationsAllowed: boolean
) => notificationsAllowed && moment(dismissedUntil).isAfter(moment())

const dismissedUntilFor = (option: DismissOption) =>
  moment().add(option.duration, option.unit).toDate()

const captureDismissed = (option: DismissOption, reminderScheduled: boolean) =>
  analytics.capture('contact_dismissed', {
    duration: option.key,
    reminder_scheduled: reminderScheduled,
  })

const formatUntil = (option: DismissOption, dismissedUntil: Date) =>
  option.unit === 'seconds' || option.unit === 'minutes'
    ? formatTime(dismissedUntil, { withSeconds: true })
    : formatDate(dismissedUntil, { style: 'medium' })

// Read at dismiss time: these hooks run in every list row, so they can't
// afford a permissions listener per row.
const notificationsAllowed = async () =>
  (await Notifications.getPermissionsAsync()).granted

/**
 * Hides a Contact until the chosen duration passes, scheduling a "available
 * again" reminder when notifications are allowed, and confirms with a toast.
 * Dismissing is reversible from Dismissed Contacts, so it doesn't ask first.
 * Dismissing an already-dismissed Contact changes its duration.
 */
export default function useDismissContact() {
  const toast = useToastController()

  return async (contact: Contact, option: DismissOption) => {
    const dismissedUntil = dismissedUntilFor(option)
    const reminder = reminderWillSend(
      dismissedUntil,
      await notificationsAllowed()
    )
    useContacts.getState().dismissContact(contact.id, dismissedUntil)
    captureDismissed(option, reminder)
    const until = formatUntil(option, dismissedUntil)

    toast.show(i18n.t('contactDismissed'), {
      message: reminder
        ? i18n.t('contactDismissedWithNotificationMessage', {
            name: contact.name,
            until,
          })
        : i18n.t('contactDismissedMessage', { name: contact.name, until }),
      native: true,
    })
  }
}

/** Select mode's batch dismiss: one duration, one confirming toast. */
export function useDismissContacts() {
  const toast = useToastController()

  return async (contacts: Contact[], option: DismissOption) => {
    if (!contacts.length) return
    const dismissedUntil = dismissedUntilFor(option)
    const reminder = reminderWillSend(
      dismissedUntil,
      await notificationsAllowed()
    )
    // One store update: per-contact updates re-run the whole Contacts
    // pipeline and persist every contact once per selected contact.
    useContacts
      .getState()
      .dismissContacts(
        contacts.map((contact) => ({ id: contact.id, dismissedUntil }))
      )
    contacts.forEach(() => captureDismissed(option, reminder))
    toast.show(i18n.t('contactDismissed'), {
      // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
      message: i18n.t('contactsDismissedMessage', {
        count: contacts.length,
        until: formatUntil(option, dismissedUntil),
      }),
      native: true,
    })
  }
}

/**
 * Puts dismissed Contacts back in the list, which removes their reminders.
 * Nothing is lost, so it runs without confirmation.
 */
export function useUndismissContacts() {
  const toast = useToastController()

  return async (contacts: Contact[]) => {
    if (!contacts.length) return
    useContacts.getState().undismissContacts(contacts.map((c) => c.id))
    toast.show(
      contacts.length === 1
        ? i18n.t('contactUndismissed', { name: contacts[0].name })
        : // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
          i18n.t('contactsUndismissed', { count: contacts.length }),
      { native: true }
    )
  }
}

/** The dismiss durations to offer; developer tools add second-scale ones. */
export function useDismissDurations() {
  const developerTools = usePreferences((s) => s.developerTools)
  return developerTools
    ? [...dismissOptions, ...testDismissOptions]
    : dismissOptions
}
