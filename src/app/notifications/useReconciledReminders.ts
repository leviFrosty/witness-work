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
import { unloggedDay, unloggedDaySources } from '@/lib/unloggedDayReminders'
import { currentServiceStreak } from '@/lib/currentServiceStreak'
import { ensureReminderChannel, REMINDER_CHANNEL_ID } from '@/lib/notifications'
import { canonicalJson } from '@/lib/canonicalJson'
import { errorTracking } from '@/lib/errorTracking'
import { supportsAppIconBadge } from '@/features/notifications/lib/appIconBadge'
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'

/**
 * Removes already-delivered reminders whose record is gone, so an erased
 * Contact's name doesn't stay in Notification Center. A reminder to log time
 * goes once the day has time, its Plans are gone, or the setting is off; a
 * streak's once it's kept or the setting is off.
 */
async function retractErasedReminders() {
  const presented = await Notifications.getPresentedNotificationsAsync()
  if (!presented.length) return
  const contacts = new Set(useContacts.getState().contacts.map((c) => c.id))
  const visits = new Set(
    useConversations.getState().conversations.map((v) => v.id)
  )
  const records = useServiceReport.getState()
  const plans = new Set(records.dayPlans.map((p) => p.id))
  const prefs = usePreferences.getState()
  const unloggedDays = unloggedDaySources(records, prefs)
  const streakDue = prefs.streakReminders
    ? currentServiceStreak().due?.period
    : undefined
  for (const notification of presented) {
    const reminder = reminderData(notification)
    if (!reminder) continue
    const exists =
      reminder.kind === 'contact'
        ? contacts.has(reminder.id)
        : reminder.kind === 'visit'
          ? visits.has(reminder.id)
          : reminder.kind === 'unloggedDay'
            ? !!unloggedDays && !!unloggedDay(reminder.id, unloggedDays)
            : reminder.kind === 'streak'
              ? streakDue === reminder.id
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
          const records = useServiceReport.getState()
          const schedule = buildReminderSchedule({
            contacts: useContacts.getState().contacts,
            visits: useConversations.getState().conversations,
            plans: records.dayPlans,
            unloggedDays: unloggedDaySources(records, prefs),
            streak: prefs.streakReminders ? currentServiceStreak() : undefined,
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
          // A fired reminder adds an unread bell item, so each one sets the
          // app icon badge it would leave if nothing is read before then. The
          // bell restores the exact count once the app is used again.
          const unread = supportsAppIconBadge()
            ? useNotificationsTray.getState().unread
            : null
          const key = canonicalJson([
            schedule,
            prefs.dataProtectionMode,
            prefs.timeDisplayFormat,
            unread,
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
            for (const [index, reminder] of schedule.entries()) {
              if (stopped || queued) break
              await Notifications.scheduleNotificationAsync({
                identifier: reminder.id,
                content: {
                  ...reminderContent(reminder, {
                    dataProtectionMode: prefs.dataProtectionMode,
                    timeDisplayFormat: prefs.timeDisplayFormat,
                  }),
                  sound: true,
                  ...(unread === null ? {} : { badge: unread + index + 1 }),
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
    // Logging time, removing a Plan, or turning reminders to log time off
    // clears a delivered one, even when nothing ahead changes.
    const retract = () =>
      void retractErasedReminders().catch((error) =>
        errorTracking.captureException(error, { localReminders: 'retract' })
      )
    const plans = useServiceReport.subscribe((state, previous) => {
      if (
        state.serviceReports !== previous.serviceReports ||
        state.dayPlans !== previous.dayPlans ||
        state.recurringPlans !== previous.recurringPlans
      )
        retract()
      if (state.dayPlans !== previous.dayPlans)
        [...previous.dayPlans, ...state.dayPlans].forEach((plan) =>
          plan.notifications?.forEach((notification) =>
            obsoleteIds.add(notification.id)
          )
        )
      else if (
        state.serviceReports === previous.serviceReports &&
        state.recurringPlans === previous.recurringPlans
      )
        return
      void reconcile()
    })
    const preferences = usePreferences.subscribe((state, previous) => {
      if (
        state.unloggedDayReminders !== previous.unloggedDayReminders ||
        state.streakReminders !== previous.streakReminders
      )
        retract()
      if (
        state.returnVisitNotificationOffset !==
          previous.returnVisitNotificationOffset ||
        state.planNotificationOffset !== previous.planNotificationOffset ||
        state.unloggedDayReminders !== previous.unloggedDayReminders ||
        state.unloggedDayReminderTime !== previous.unloggedDayReminderTime ||
        state.unloggedDayRemindersEnabledAt !==
          previous.unloggedDayRemindersEnabledAt ||
        state.streakReminders !== previous.streakReminders ||
        state.role !== previous.role ||
        state.roleHistory !== previous.roleHistory ||
        state.logsHours !== previous.logsHours ||
        state.dataProtectionMode !== previous.dataProtectionMode ||
        state.timeDisplayFormat !== previous.timeDisplayFormat
      )
        void reconcile()
    })
    const tray = useNotificationsTray.subscribe((state, previous) => {
      if (state.unread !== previous.unread && supportsAppIconBadge())
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
      tray()
      foreground.remove()
    }
  }, [ready])
}
