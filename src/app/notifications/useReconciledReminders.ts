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
  type LocalReminder,
} from '@/lib/reminderSchedule'
import { reminderContent } from '@/lib/reminderContent'
import { reminderData } from '@/lib/notificationData'
import { unloggedDay, unloggedDaySources } from '@/lib/unloggedDayReminders'
import { currentServiceStreak } from '@/lib/currentServiceStreak'
import { ensureReminderChannel, REMINDER_CHANNEL_ID } from '@/lib/notifications'
import { canonicalJson } from '@/lib/canonicalJson'
import { contentHash } from '@/lib/contentHash'
import { addForegroundListener } from '@/lib/appLifecycle'
import { mmkvStorage } from '@/stores/mmkv'
import { errorTracking } from '@/lib/errorTracking'
import { supportsAppIconBadge } from '@/features/notifications/lib/appIconBadge'
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { DayPlan } from '@/types/timeEntry'

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

/** Edits, syncs and app returns that arrive together run one pass. */
export const RECONCILE_DELAY_MS = 250
const OWN_PREFIX = 'witness-work-'
const STATE_KEY = 'reminderSchedule'

type ScheduleState = {
  /** The whole schedule's key after the last completed pass; '' when dirty. */
  key: string
  /** The local day of that pass. A new day checks the OS schedule again. */
  day: string
  /** Each scheduled reminder's content key, by OS request id. */
  ids: Record<string, string>
}

function loadState(): ScheduleState {
  try {
    const stored = mmkvStorage.getString(STATE_KEY)
    if (stored) return JSON.parse(stored) as ScheduleState
  } catch {
    // Unreadable: the next pass compares against the OS schedule instead.
  }
  return { key: '', day: '', ids: {} }
}

function saveState(state: ScheduleState) {
  mmkvStorage.set(STATE_KEY, JSON.stringify(state))
}

const isLegacyId = (id: string) => !id.startsWith(OWN_PREFIX)

/**
 * Request ids that a record held before this app named them after the record
 * (`reminderRequestId`): an older version, or another device, may have
 * scheduled them on this install.
 */
function addLegacyIds(into: Set<string>, ids: (string | undefined)[]) {
  for (const id of ids) if (id && isLegacyId(id)) into.add(id)
}

/** Legacy ids of the records that were added, removed, or changed their ids. */
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

/**
 * OS identifiers belong to this install. Rebuild them from intent after any
 * import/merge.
 *
 * Each pass diffs against what the OS has scheduled: only new or changed
 * reminders are scheduled (re-adding an id replaces it), and then only ids that
 * are no longer wanted are cancelled. A pass the OS suspends partway (a
 * background wake) leaves the previous reminders in place rather than none.
 */
export function useReconciledReminders(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready) return
    let stopped = false,
      running = false,
      queued = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let retractTimer: ReturnType<typeof setTimeout> | undefined
    let state = loadState()
    let inProgressObsoleteIds: Set<string> | undefined
    /** Legacy ids from edits; each forces a pass that cancels them. */
    const obsoleteIds = new Set<string>()
    /**
     * Legacy ids records held at launch. Already cancelled by an earlier pass
     * unless this version is new here, so they're cancelled whenever a pass
     * runs but don't force one.
     */
    const launchLegacyIds = new Set<string>()
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
          // bell restores the exact count once the app is used again. A new
          // unread count therefore reschedules every badged reminder.
          const unread = supportsAppIconBadge()
            ? useNotificationsTray.getState().unread
            : null
          const { granted } = await Notifications.getPermissionsAsync()
          const options = {
            dataProtectionMode: prefs.dataProtectionMode,
            timeDisplayFormat: prefs.timeDisplayFormat,
          }
          // Content includes the app language's wording, so a language change
          // reschedules too.
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
            canonicalJson([granted, [...wanted.values()].map((r) => r.key)])
          )
          const day = new Date().toDateString()
          if (
            key === state.key &&
            day === state.day &&
            obsoleteIds.size === 0
          ) {
            perf.count('reminders:skip')
            continue
          }
          const obsoleteForPass = new Set(obsoleteIds)
          inProgressObsoleteIds = obsoleteForPass
          for (const id of obsoleteForPass) obsoleteIds.delete(id)
          // Cache only a completed pass.
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
          // Cancel only after the new schedule is in, so an interrupted pass
          // never leaves nothing scheduled.
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
            // Not cancelled yet; the next pass still needs them.
            for (const id of obsoleteForPass) obsoleteIds.add(id)
          }
          inProgressObsoleteIds = undefined
          // Best effort: a failure here mustn't undo the schedule above.
          clearTimeout(retractTimer)
          await retractErasedReminders().catch((error) =>
            errorTracking.captureException(error, {
              localReminders: 'retract',
            })
          )
          if (!interrupted && !queued && !stopped)
            state = { ...state, key, day }
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
    // Logging time, removing a Plan, or turning reminders to log time off
    // clears a delivered one, even when nothing ahead changes.
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
        request()
    })
    const tray = useNotificationsTray.subscribe((state, previous) => {
      if (state.unread !== previous.unread && supportsAppIconBadge()) request()
    })
    // Time passing, a new permission or language: the pass skips itself when
    // none of that changed the schedule.
    const foreground = addForegroundListener(request)
    // Remove legacy ids too; a restored device may carry foreign ids.
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
