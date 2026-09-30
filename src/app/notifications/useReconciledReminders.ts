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
import { canonicalJson } from '@/lib/canonicalJson'
import i18n from '@/lib/locales'
import { errorTracking } from '@/lib/errorTracking'

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
          const key = canonicalJson([schedule, prefs.dataProtectionMode])
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
            if (Platform.OS === 'android')
              await Notifications.setNotificationChannelAsync(
                'expo_notifications_fallback_notification_channel',
                {
                  name: i18n.t('notifications'),
                  importance: Notifications.AndroidImportance.HIGH,
                }
              )
            for (const reminder of schedule) {
              if (stopped || queued) break
              await Notifications.scheduleNotificationAsync({
                identifier: reminder.id,
                content: {
                  title: i18n.t(
                    reminder.kind === 'plan'
                      ? 'plan_reminder_title'
                      : 'reminder_title'
                  ),
                  body: i18n.t(
                    reminder.kind === 'contact'
                      ? 'contactAvailableReminder'
                      : reminder.kind === 'plan'
                        ? 'planLocalReminder'
                        : 'visitLocalReminder',
                    {
                      name: prefs.dataProtectionMode
                        ? ''
                        : (reminder.name ?? ''),
                    }
                  ),
                  sound: true,
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: reminder.date,
                },
              })
            }
          }
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
        state.dataProtectionMode !== previous.dataProtectionMode
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
