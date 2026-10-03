import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import {
  usePreferences,
  DEFAULT_PLAN_NOTIFICATION_OFFSET,
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
} from '@/stores/preferences'
import { buildReminderSchedule } from '@/lib/reminderSchedule'
import { reminderContent } from '@/lib/reminderContent'
import { reminderData } from '@/lib/notificationData'
import { ensureReminderChannel, REMINDER_CHANNEL_ID } from '@/lib/notifications'
import { canonicalJson } from '@/lib/canonicalJson'
import { errorTracking } from '@/lib/errorTracking'

/**
 * Removes already-delivered reminders whose record is gone, so an erased
 * Contact's name doesn't stay in Notification Center.
 */
async function retractErasedReminders() {
  const presented = await Notifications.getPresentedNotificationsAsync()
  if (!presented.length) return
  const contacts = new Set(useContacts.getState().contacts.map((c) => c.id))
  const visits = new Set(
    useConversations.getState().conversations.map((v) => v.id)
  )
  const plans = new Set(useServiceReport.getState().dayPlans.map((p) => p.id))
  for (const notification of presented) {
    const reminder = reminderData(notification)
    if (!reminder) continue
    const exists =
      reminder.kind === 'contact'
        ? contacts.has(reminder.id)
        : reminder.kind === 'visit'
          ? visits.has(reminder.id)
          : plans.has(reminder.id)
    if (!exists)
      await Notifications.dismissNotificationAsync(
        notification.request.identifier
      )
  }
}

/**
 * OS identifiers belong to this install. Rebuild them from intent after any
 * import/merge.
 */
export function useReconciledReminders(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready) return
    let stopped = false,
      running = false,
      queued = false
    let lastSchedule = ''
    let inProgressObsoleteIds: Set<string> | undefined
    const obsoleteIds = new Set<string>()
    const reconcile = async () => {
      queued = true
      if (running) return
      running = true
      try {
        while (queued && !stopped) {
          queued = false
          const prefs = usePreferences.getState()
          const schedule = buildReminderSchedule({
            contacts: useContacts.getState().contacts,
            visits: useConversations.getState().conversations,
            plans: useServiceReport.getState().dayPlans,
            visitOffset: {
              ...DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
              ...prefs.returnVisitNotificationOffset,
            },
            planOffset: {
              ...DEFAULT_PLAN_NOTIFICATION_OFFSET,
              ...prefs.planNotificationOffset,
            },
            now: Date.now(),
          })
          const key = canonicalJson([
            schedule,
            prefs.dataProtectionMode,
            prefs.timeDisplayFormat,
          ])
          if (key === lastSchedule && obsoleteIds.size === 0) continue
          // Cancellation invalidates the old schedule even if a queued edit
          // has the same reminder intent. Cache only a completed pass.
          lastSchedule = ''
          const obsoleteForPass = new Set(obsoleteIds)
          inProgressObsoleteIds = obsoleteForPass
          for (const id of obsoleteForPass) obsoleteIds.delete(id)
          const scheduled =
            await Notifications.getAllScheduledNotificationsAsync()
          for (const request of scheduled) {
            if (
              request.identifier.startsWith('witness-work-') ||
              obsoleteForPass.has(request.identifier)
            ) {
              await Notifications.cancelScheduledNotificationAsync(
                request.identifier
              )
            }
          }
          inProgressObsoleteIds = undefined
          const permission = await Notifications.getPermissionsAsync()
          if (permission.granted) {
            if (Platform.OS === 'android') await ensureReminderChannel()
            for (const reminder of schedule) {
              if (stopped || queued) break
              await Notifications.scheduleNotificationAsync({
                identifier: reminder.id,
                content: {
                  ...reminderContent(reminder, {
                    dataProtectionMode: prefs.dataProtectionMode,
                    timeDisplayFormat: prefs.timeDisplayFormat,
                  }),
                  sound: true,
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: reminder.date,
                  ...(Platform.OS === 'android'
                    ? { channelId: REMINDER_CHANNEL_ID }
                    : {}),
                },
              })
            }
          }
          // Best effort: a failure here mustn't undo the schedule above.
          await retractErasedReminders().catch((error) =>
            errorTracking.captureException(error, {
              localReminders: 'retract',
            })
          )
          if (!queued && !stopped) lastSchedule = key
        }
      } catch (error) {
        for (const id of inProgressObsoleteIds ?? []) obsoleteIds.add(id)
        inProgressObsoleteIds = undefined
        lastSchedule = ''
        errorTracking.captureException(error, { localReminders: 'reconcile' })
      } finally {
        running = false
      }
    }
    const contacts = useContacts.subscribe((state, previous) => {
      if (state.contacts === previous.contacts) return
      ;[...previous.contacts, ...state.contacts].forEach((contact) => {
        if (contact.dismissedNotificationId)
          obsoleteIds.add(contact.dismissedNotificationId)
      })
      void reconcile()
    })
    const visits = useConversations.subscribe((state, previous) => {
      if (state.conversations === previous.conversations) return
      ;[...previous.conversations, ...state.conversations].forEach((visit) =>
        visit.followUp?.notifications?.forEach((notification) =>
          obsoleteIds.add(notification.id)
        )
      )
      void reconcile()
    })
    const plans = useServiceReport.subscribe((state, previous) => {
      if (state.dayPlans === previous.dayPlans) return
      ;[...previous.dayPlans, ...state.dayPlans].forEach((plan) =>
        plan.notifications?.forEach((notification) =>
          obsoleteIds.add(notification.id)
        )
      )
      void reconcile()
    })
    const preferences = usePreferences.subscribe((state, previous) => {
      if (
        state.returnVisitNotificationOffset !==
          previous.returnVisitNotificationOffset ||
        state.planNotificationOffset !== previous.planNotificationOffset ||
        state.dataProtectionMode !== previous.dataProtectionMode ||
        state.timeDisplayFormat !== previous.timeDisplayFormat
      )
        void reconcile()
    })
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        lastSchedule = ''
        void reconcile()
      }
    })
    // Remove legacy ids at launch too; a restored device may carry foreign ids.
    useConversations
      .getState()
      .conversations.forEach((visit) =>
        visit.followUp?.notifications?.forEach((notification) =>
          obsoleteIds.add(notification.id)
        )
      )
    useServiceReport
      .getState()
      .dayPlans.forEach((plan) =>
        plan.notifications?.forEach((notification) =>
          obsoleteIds.add(notification.id)
        )
      )
    useContacts.getState().contacts.forEach((contact) => {
      if (contact.dismissedNotificationId)
        obsoleteIds.add(contact.dismissedNotificationId)
    })
    void reconcile()
    return () => {
      stopped = true
      contacts()
      visits()
      plans()
      preferences()
      foreground.remove()
    }
  }, [ready])
}
