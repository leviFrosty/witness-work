import * as Notifications from 'expo-notifications'
import moment from 'moment'
import { useToastController } from '@tamagui/toast'

import { analytics } from '@/lib/analytics'
import { formatDate, formatTime } from '@/lib/dates'
import { errorTracking } from '@/lib/errorTracking'
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

const REMINDER_EMOJIS = [
  '🔄',
  '✨',
  '👋',
  '⭐',
  '🎉',
  '💫',
  '👀',
  '💪',
  '⏱️',
  '🌟',
]

const cancelReminder = async (contact: Contact) => {
  if (!contact.dismissedNotificationId) return
  try {
    await Notifications.cancelScheduledNotificationAsync(
      contact.dismissedNotificationId
    )
  } catch (error) {
    errorTracking.captureException(error)
  }
}

/**
 * Replaces any reminder from an earlier dismissal with one for when the Contact
 * comes back. Returns the new reminder's id, if one was scheduled.
 */
const replaceReminder = async (
  contact: Contact,
  dismissedUntil: Date,
  notificationsAllowed: boolean
) => {
  await cancelReminder(contact)
  if (!notificationsAllowed || !moment(dismissedUntil).isAfter(moment()))
    return undefined
  try {
    const emoji =
      REMINDER_EMOJIS[Math.floor(Math.random() * REMINDER_EMOJIS.length)]
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('contactAvailableAgain'),
        body: i18n.t('contactAvailableAgainMessage', {
          name: contact.name,
          emoji,
        }),
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: dismissedUntil,
      },
    })
  } catch (error) {
    errorTracking.captureException(error)
    return undefined
  }
}

const dismissedUntilFor = (option: DismissOption) =>
  moment().add(option.duration, option.unit).toDate()

const captureDismissed = (option: DismissOption, notificationId?: string) =>
  analytics.capture('contact_dismissed', {
    duration: option.key,
    reminder_scheduled: !!notificationId,
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
    const notificationId = await replaceReminder(
      contact,
      dismissedUntil,
      await notificationsAllowed()
    )
    useContacts
      .getState()
      .dismissContact(contact.id, dismissedUntil, notificationId)
    captureDismissed(option, notificationId)
    const until = formatUntil(option, dismissedUntil)

    toast.show(i18n.t('contactDismissed'), {
      message: notificationId
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
    const allowed = await notificationsAllowed()
    const dismissedUntil = dismissedUntilFor(option)
    const notificationIds = await Promise.all(
      contacts.map((contact) =>
        replaceReminder(contact, dismissedUntil, allowed)
      )
    )
    // One store update: per-contact updates re-run the whole Contacts
    // pipeline and persist every contact once per selected contact.
    useContacts.getState().dismissContacts(
      contacts.map((contact, index) => ({
        id: contact.id,
        dismissedUntil,
        dismissedNotificationId: notificationIds[index],
      }))
    )
    notificationIds.forEach((id) => captureDismissed(option, id))
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
 * Puts dismissed Contacts back in the list and cancels their reminders. Nothing
 * is lost, so it runs without confirmation.
 */
export function useUndismissContacts() {
  const toast = useToastController()

  return async (contacts: Contact[]) => {
    if (!contacts.length) return
    await Promise.all(contacts.map(cancelReminder))
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
