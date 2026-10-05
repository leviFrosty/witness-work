import { AppState, AppStateStatus } from 'react-native'
import debounce from 'lodash/debounce'
import * as WatchBridge from '../../../modules/watch-bridge'
import { useServiceReport } from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useConversations } from '@/stores/conversationStore'
import useContacts from '@/stores/contactsStore'
import useCategories from '@/stores/categories'
import { mmkvStorage } from '@/stores/mmkv'
import { analytics } from '@/lib/analytics'
import type { AnalyticsEventName } from '@/lib/analyticsEvents'
import { logger } from '@/lib/logger'
import {
  addCalendarMonths,
  calendarMonthOf,
  roleForMonth,
} from '@/lib/roleHistory'
import { tracksHours } from '@/lib/publisherCapabilities'
import { buildWatchSnapshot } from '@/app/watch/buildWatchSnapshot'
import { planWatchEntries } from '@/app/watch/planWatchEntries'

/** Native analytics events JS may forward; anything else is dropped. */
const FORWARDED_EVENTS = new Set<string>([
  'watch_timer_action_completed',
] satisfies AnalyticsEventName[])
const STATUS_CAPTURED_AT_KEY = 'watchStatusCapturedAt'
/** Widget kinds in `targets/watch-widgets`. */
const PROGRESS_COMPLICATION = 'WitnessWorkProgress'
const UP_NEXT_COMPLICATION = 'WitnessWorkUpNext'
const STATUS_CAPTURE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

let installed = false
let lastPushedContent: string | null = null
let draining = false

/**
 * Builds the watch snapshot from the stores and hands it to the native layer,
 * which keeps it and sends it to a paired Apple Watch. Skipped when no watch is
 * paired, and when nothing the watch shows changed unless `force`d.
 * `reflectedEntryIds` are watch entries just saved but not yet resolved.
 */
export function pushWatchSnapshot(
  reason: string,
  force = false,
  reflectedEntryIds: string[] = []
): void {
  if (!WatchBridge.isAvailable() || !WatchBridge.getStatus().isPaired) return

  try {
    const sr = useServiceReport.getState()
    const prefs = usePreferences.getState()
    // The watch shows this month, so it uses this month's role (Role History).
    const month = calendarMonthOf()
    const publisher = roleForMonth(prefs.roleHistory, prefs.role, month)
    const nextPublisher = roleForMonth(
      prefs.roleHistory,
      prefs.role,
      addCalendarMonths(month, 1)
    )
    const snapshot = buildWatchSnapshot({
      serviceReports: sr.serviceReports,
      publisher,
      publisherHours: prefs.publisherHours,
      monthlyGoalOverrides: prefs.monthlyGoalOverrides,
      overrideCreditLimit: prefs.overrideCreditLimit,
      customCreditLimitHours: prefs.customCreditLimitHours,
      timeDisplayFormat: prefs.timeDisplayFormat,
      dayPlans: sr.dayPlans,
      recurringPlans: sr.recurringPlans,
      conversations: useConversations.getState().conversations,
      contacts: useContacts.getState().contacts,
      showsTimeEntry: tracksHours(publisher, prefs.logsHours),
      nextMonth: {
        publisher: nextPublisher,
        showsTimeEntry: tracksHours(nextPublisher, prefs.logsHours),
      },
      categories: useCategories.getState().categories,
      reflectedEntryIds,
    })

    const { generatedAt, ...content } = snapshot
    const contentKey = JSON.stringify(content)
    if (!force && contentKey === lastPushedContent) return
    WatchBridge.setSnapshot(JSON.stringify(snapshot))
    lastPushedContent = contentKey
  } catch (e) {
    logger.error(`[watchSync] failed to push snapshot (${reason})`, e)
  }
}

/**
 * Saves Time Entries made on the watch and forwards native analytics events.
 * Each entry is persisted before the native layer is told it's handled, so a
 * crash in between only causes a repeat delivery, which is recognized by id.
 */
function drainInbox(): void {
  if (!WatchBridge.isAvailable() || draining) return
  draining = true
  try {
    const drafts = WatchBridge.getPendingEntries()
    if (drafts.length) {
      const sr = useServiceReport.getState()
      const plans = planWatchEntries(drafts, {
        serviceReports: sr.serviceReports,
        deletedServiceReports: sr.deletedServiceReports,
        categories: useCategories.getState().categories,
      })
      for (const plan of plans) {
        if (plan.status === 'add') {
          sr.addServiceReport(plan.entry)
          analytics.capture('time_entry_created', {
            source: 'watch',
            watch_origin: plan.origin,
            entry_mode:
              plan.entry.hours || plan.entry.minutes ? 'hours' : 'checkbox',
            has_category: !!plan.entry.categoryId,
            has_note: false,
          })
          if (plan.categoryRemoved) {
            analytics.capture('watch_entry_adjusted', {
              reason: 'category_removed',
            })
          }
        } else if (plan.status === 'deleted' || plan.status === 'invalid') {
          analytics.capture('watch_entry_skipped', { reason: plan.status })
        }
      }
      // Send the updated progress before the watch stops showing these
      // entries as syncing, so its total never dips. Until they're resolved
      // the watch also adds them itself, so name them as already counted.
      const ids = plans.map((plan) => plan.id)
      pushWatchSnapshot('watch-entries', true, ids)
      WatchBridge.resolveEntries(ids)
    }

    for (const event of WatchBridge.takeEvents()) {
      if (FORWARDED_EVENTS.has(event.name)) {
        analytics.capture(event.name as AnalyticsEventName, event.properties)
      }
    }
  } catch (e) {
    logger.error('[watchSync] failed to save watch entries', e)
  } finally {
    draining = false
  }
}

/** Weekly adoption signal: is the watch app installed, with complications? */
function captureWatchStatus(): void {
  const status = WatchBridge.getStatus()
  if (!status.isWatchAppInstalled) return
  const capturedAt = mmkvStorage.getNumber(STATUS_CAPTURED_AT_KEY) ?? 0
  if (Date.now() - capturedAt < STATUS_CAPTURE_INTERVAL_MS) return
  // Unknown until the watch app reports the complications in use.
  const kinds = status.activeComplications
  analytics.capture('watch_app_status', {
    complication_enabled: status.isComplicationEnabled,
    progress_complication: kinds?.includes(PROGRESS_COMPLICATION),
    up_next_complication: kinds?.includes(UP_NEXT_COMPLICATION),
  })
  mmkvStorage.set(STATUS_CAPTURED_AT_KEY, Date.now())
}

const debouncedPush = debounce(() => pushWatchSnapshot('store-change'), 500, {
  leading: false,
  trailing: true,
})

/**
 * Connects the stores to the Apple Watch: saves entries made on the watch and
 * keeps its snapshot current. Install once storage has hydrated. Idempotent;
 * returns a teardown function for tests.
 */
export function installWatchSync(): () => void {
  if (!WatchBridge.isAvailable() || installed) return () => {}
  installed = true

  const unsubscribes = [
    useServiceReport.subscribe(() => debouncedPush()),
    usePreferences.subscribe(() => debouncedPush()),
    useCategories.subscribe(() => debouncedPush()),
    // Up Next shows Follow-ups and their Contacts.
    useConversations.subscribe(() => debouncedPush()),
    useContacts.subscribe(() => debouncedPush()),
  ]

  // Foreground covers midnight and month rollover, language changes, and
  // entries delivered while JS couldn't run.
  const onAppState = (state: AppStateStatus) => {
    if (state !== 'active') return
    drainInbox()
    pushWatchSnapshot('foreground')
    captureWatchStatus()
  }
  const appStateSub = AppState.addEventListener('change', onAppState)
  const inboxSub = WatchBridge.onInboxChange(drainInbox)
  // A newly paired watch or newly installed watch app needs the snapshot even
  // though nothing in the stores changed.
  const statusSub = WatchBridge.onStatusChange(() => {
    pushWatchSnapshot('status-change', true)
    captureWatchStatus()
  })

  drainInbox()
  pushWatchSnapshot('cold-start', true)
  captureWatchStatus()

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe())
    debouncedPush.cancel()
    appStateSub.remove()
    inboxSub.remove()
    statusSub.remove()
    lastPushedContent = null
    installed = false
  }
}
