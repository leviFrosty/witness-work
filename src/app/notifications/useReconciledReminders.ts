import { perf } from '@/lib/perf'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import {
  usePreferences,
  DEFAULT_PLAN_NOTIFICATION_OFFSET,
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
} from '@/stores/preferences'
import {
  buildReminderSchedule,
  recurringPlanOnDay,
  type LocalReminder,
} from '@/lib/reminderSchedule'
import { reminderContent } from '@/lib/reminderContent'
import { reminderData } from '@/lib/notificationData'
import { unloggedDay, unloggedDaySources } from '@/lib/unloggedDayReminders'
import { monthReportDue, monthReportSources } from '@/lib/monthReportReminders'
import { weekNeedsPlan, weekPlanSources } from '@/lib/weekPlanReminders'
import { currentServiceStreak } from '@/lib/currentServiceStreak'
import { streakRemindersOn } from '@/lib/serviceStreak'
import {
  ensureReminderChannel,
  REMINDER_CHANNEL_ID,
  reminderChannelName,
} from '@/lib/notifications'
import { canonicalJson } from '@/lib/canonicalJson'
import { contentHash } from '@/lib/contentHash'
import { addForegroundListener } from '@/lib/appLifecycle'
import { deviceTimeZone, refreshLocalTimeOffset } from '@/lib/deviceTimeZone'
import { isStorageLocked, mmkvStorage } from '@/stores/mmkv'
import { errorTracking } from '@/lib/errorTracking'
import { captureExceptionThrottled } from '@/lib/throttledErrorReport'
import { supportsAppIconBadge } from '@/features/notifications/lib/appIconBadge'
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { DayPlan } from '@/types/timeEntry'

async function retractErasedReminders() {
  const presented = await Notifications.getPresentedNotificationsAsync()
  if (!presented.length) return
  const contacts = new Set(useContacts.getState().contacts.map((c) => c.id))
  const visits = new Set(
    useConversations.getState().conversations.map((v) => v.id)
  )
  const records = useServiceReport.getState()
  const plans = new Set(records.dayPlans.map((p) => p.id))
  const recurringPlans = new Map(records.recurringPlans.map((p) => [p.id, p]))
  const prefs = usePreferences.getState()
  const unloggedDays = unloggedDaySources(records, prefs)
  const weekPlan = weekPlanSources(records, prefs)
  const streakDue = streakRemindersOn(prefs)
    ? currentServiceStreak().due?.period
    : undefined
  const recurringPlanExists = (id: string, day: string) => {
    const plan = recurringPlans.get(id)
    return !!plan && recurringPlanOnDay(plan, day)
  }
  const monthReport = monthReportSources(records, prefs)
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
              : reminder.kind === 'monthReport'
                ? !!monthReport && monthReportDue(reminder.id, monthReport)
                : reminder.kind === 'weekPlan'
                  ? !!weekPlan && weekNeedsPlan(reminder.id, weekPlan)
                  : reminder.day
                    ? recurringPlanExists(reminder.id, reminder.day)
                    : plans.has(reminder.id)
    if (!exists)
      await Notifications.dismissNotificationAsync(
        notification.request.identifier
      )
  }
}

export const RECONCILE_DELAY_MS = 250
const OWN_PREFIX = 'witness-work-'
const STATE_KEY = 'reminderSchedule'

type ScheduleState = {
  key: string

  day: string

  zone?: string

  ids: Record<string, string>
}

function loadState(): ScheduleState {
  try {
    const stored = mmkvStorage.getString(STATE_KEY)
    if (stored) return JSON.parse(stored) as ScheduleState
  } catch {}
  return { key: '', day: '', ids: {} }
}

function saveState(state: ScheduleState) {
  try {
    mmkvStorage.set(STATE_KEY, JSON.stringify(state))
  } catch (error) {
    captureExceptionThrottled('localReminders:save', error, {
      localReminders: 'save',
    })
  }
}

const isLegacyId = (id: string) => !id.startsWith(OWN_PREFIX)

function addLegacyIds(into: Set<string>, ids: (string | undefined)[]) {
  for (const id of ids) if (id && isLegacyId(id)) into.add(id)
}

function changedLegacyIds<T extends { id: string }>(
  previous: T[],
  next: T[],
  idsOf: (record: T) => (string | undefined)[],
  into: Set<string>
) {
  const before = new Map(previous.map((record) => [record.id, record]))
  for (const record of next) {
    const old = before.get(record.id)
    before.delete(record.id)
    if (old === record) continue
    const ids = idsOf(record)
    const oldIds = old ? idsOf(old) : []
    if (ids.join('\n') === oldIds.join('\n')) continue
    addLegacyIds(into, [...ids, ...oldIds])
  }
  for (const removed of before.values()) addLegacyIds(into, idsOf(removed))
}

const visitIds = (visit: Visit) =>
  visit.followUp?.notifications?.map((notification) => notification.id) ?? []
const planIds = (plan: DayPlan) =>
  plan.notifications?.map((notification) => notification.id) ?? []
const contactIds = (contact: Contact) => [contact.dismissedNotificationId]

type ReminderRequest = Notifications.NotificationRequestInput & {
  identifier: string
}

function reminderRequest(
  reminder: LocalReminder,
  options: Parameters<typeof reminderContent>[1],
  badge: number | undefined
): ReminderRequest {
  return {
    identifier: reminder.id,
    content: {
      ...reminderContent(reminder, options),
      sound: true,
      ...(badge === undefined ? {} : { badge }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminder.date,
      ...(Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  }
}

export function useReconciledReminders(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready || isStorageLocked()) return
    let stopped = false,
      running = false,
      queued = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let retractTimer: ReturnType<typeof setTimeout> | undefined
    let state = loadState()
    let inProgressObsoleteIds: Set<string> | undefined

    const obsoleteIds = new Set<string>()

    const launchLegacyIds = new Set<string>()
    const reconcile = async () => {
      queued = true
      if (running) return
      running = true
      try {
        while (queued && !stopped) {
          queued = false

          const zone = deviceTimeZone()
          if (zone !== state.zone) refreshLocalTimeOffset()
          const prefs = usePreferences.getState()
          const records = useServiceReport.getState()
          const schedule = buildReminderSchedule({
            contacts: useContacts.getState().contacts,
            visits: useConversations.getState().conversations,
            plans: records.dayPlans,
            recurringPlans: records.recurringPlans,
            unloggedDays: unloggedDaySources(records, prefs),
            streak: streakRemindersOn(prefs)
              ? currentServiceStreak()
              : undefined,
            monthReport: monthReportSources(records, prefs),
            weekPlan: weekPlanSources(records, prefs),
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

          const unread = supportsAppIconBadge()
            ? useNotificationsTray.getState().unread
            : null
          const { granted } = await Notifications.getPermissionsAsync()
          const options = {
            dataProtectionMode: prefs.dataProtectionMode,
            timeDisplayFormat: prefs.timeDisplayFormat,
          }

          const wanted = new Map(
            (granted ? schedule : []).map((reminder, index) => {
              const request = reminderRequest(
                reminder,
                options,
                unread === null ? undefined : unread + index + 1
              )
              return [
                reminder.id,
                { request, key: contentHash(canonicalJson(request)) },
              ] as const
            })
          )

          const key = contentHash(
            canonicalJson([
              granted,
              reminderChannelName(),
              [...wanted.values()].map((r) => r.key),
            ])
          )
          const day = new Date().toDateString()
          if (
            key === state.key &&
            day === state.day &&
            zone === state.zone &&
            obsoleteIds.size === 0
          ) {
            perf.count('reminders:skip')
            continue
          }
          const obsoleteForPass = new Set(obsoleteIds)
          inProgressObsoleteIds = obsoleteForPass
          for (const id of obsoleteForPass) obsoleteIds.delete(id)

          state = { ...state, key: '' }
          const scheduled =
            await Notifications.getAllScheduledNotificationsAsync()
          const present = new Set(scheduled.map((r) => r.identifier))
          let interrupted = false
          if (granted && Platform.OS === 'android')
            await ensureReminderChannel()
          for (const [id, { request, key: itemKey }] of wanted) {
            if (stopped || queued) {
              interrupted = true
              break
            }
            if (present.has(id) && state.ids[id] === itemKey) continue
            perf.count('reminders:schedule')
            await Notifications.scheduleNotificationAsync(request)
            state.ids = { ...state.ids, [id]: itemKey }
          }

          if (!interrupted) {
            for (const { identifier } of scheduled) {
              if (wanted.has(identifier)) continue
              if (
                identifier.startsWith(OWN_PREFIX) ||
                obsoleteForPass.has(identifier) ||
                launchLegacyIds.has(identifier)
              ) {
                perf.count('reminders:cancel')
                await Notifications.cancelScheduledNotificationAsync(identifier)
              }
            }
            state.ids = Object.fromEntries(
              [...wanted].map(([id, item]) => [id, item.key])
            )
          } else {
            for (const id of obsoleteForPass) obsoleteIds.add(id)
          }
          inProgressObsoleteIds = undefined

          clearTimeout(retractTimer)
          await retractErasedReminders().catch((error) =>
            errorTracking.captureException(error, {
              localReminders: 'retract',
            })
          )
          if (!interrupted && !queued && !stopped)
            state = { ...state, key, day, zone }
          saveState(state)
        }
      } catch (error) {
        for (const id of inProgressObsoleteIds ?? []) obsoleteIds.add(id)
        inProgressObsoleteIds = undefined
        state = { ...state, key: '' }
        saveState(state)
        errorTracking.captureException(error, { localReminders: 'reconcile' })
      } finally {
        running = false
      }
    }
    const request = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void reconcile(), RECONCILE_DELAY_MS)
    }
    const contacts = useContacts.subscribe((state, previous) => {
      if (state.contacts === previous.contacts) return
      changedLegacyIds(
        previous.contacts,
        state.contacts,
        contactIds,
        obsoleteIds
      )
      request()
    })
    const visits = useConversations.subscribe((state, previous) => {
      if (state.conversations === previous.conversations) return
      changedLegacyIds(
        previous.conversations,
        state.conversations,
        visitIds,
        obsoleteIds
      )
      request()
    })

    const retract = () => {
      clearTimeout(retractTimer)
      retractTimer = setTimeout(
        () =>
          void retractErasedReminders().catch((error) =>
            errorTracking.captureException(error, {
              localReminders: 'retract',
            })
          ),
        RECONCILE_DELAY_MS
      )
    }
    const plans = useServiceReport.subscribe((state, previous) => {
      if (
        state.serviceReports !== previous.serviceReports ||
        state.dayPlans !== previous.dayPlans ||
        state.recurringPlans !== previous.recurringPlans
      )
        retract()
      if (state.dayPlans !== previous.dayPlans)
        changedLegacyIds(
          previous.dayPlans,
          state.dayPlans,
          planIds,
          obsoleteIds
        )
      else if (
        state.serviceReports === previous.serviceReports &&
        state.recurringPlans === previous.recurringPlans
      )
        return
      request()
    })
    const preferences = usePreferences.subscribe((state, previous) => {
      if (
        state.unloggedDayReminders !== previous.unloggedDayReminders ||
        state.streakReminders !== previous.streakReminders ||
        state.showStreaks !== previous.showStreaks ||
        state.monthReportReminders !== previous.monthReportReminders ||
        state.submittedReportMonths !== previous.submittedReportMonths ||
        state.weekPlanReminder !== previous.weekPlanReminder ||
        state.offDays !== previous.offDays
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
        state.showStreaks !== previous.showStreaks ||
        state.monthReportReminders !== previous.monthReportReminders ||
        state.monthReportReminderTime !== previous.monthReportReminderTime ||
        state.submittedReportMonths !== previous.submittedReportMonths ||
        state.weekPlanReminder !== previous.weekPlanReminder ||
        state.weekPlanReminderDay !== previous.weekPlanReminderDay ||
        state.weekPlanReminderTime !== previous.weekPlanReminderTime ||
        state.weekPlanReminderEnabledAt !==
          previous.weekPlanReminderEnabledAt ||
        state.offDays !== previous.offDays ||
        state.startOfWeek !== previous.startOfWeek ||
        state.formatRegion !== previous.formatRegion ||
        state.role !== previous.role ||
        state.roleHistory !== previous.roleHistory ||
        state.logsHours !== previous.logsHours ||
        state.dataProtectionMode !== previous.dataProtectionMode ||
        state.timeDisplayFormat !== previous.timeDisplayFormat
      )
        request()
    })
    const tray = useNotificationsTray.subscribe((state, previous) => {
      if (state.unread !== previous.unread && supportsAppIconBadge()) request()
    })

    const foreground = addForegroundListener(request)

    useConversations
      .getState()
      .conversations.forEach((visit) =>
        addLegacyIds(launchLegacyIds, visitIds(visit))
      )
    useServiceReport
      .getState()
      .dayPlans.forEach((plan) => addLegacyIds(launchLegacyIds, planIds(plan)))
    useContacts
      .getState()
      .contacts.forEach((contact) =>
        addLegacyIds(launchLegacyIds, contactIds(contact))
      )
    request()
    return () => {
      stopped = true
      clearTimeout(timer)
      clearTimeout(retractTimer)
      contacts()
      visits()
      plans()
      preferences()
      tray()
      foreground.remove()
    }
  }, [ready])
}
