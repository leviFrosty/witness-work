import { perf } from '@/lib/perf'
import { AppState, Platform } from 'react-native'
import debounce from 'lodash/debounce'
import * as WatchBridge from '../../../modules/watch-bridge'
import { useServiceReport } from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useConversations } from '@/stores/conversationStore'
import useContacts from '@/stores/contactsStore'
import useCategories from '@/stores/categories'
import useMileage from '@/stores/mileage'
import { mmkvStorage } from '@/stores/mmkv'
import { analytics } from '@/lib/analytics'
import type { AnalyticsEventName } from '@/lib/analyticsEvents'
import { logger } from '@/lib/logger'
import { addForegroundListener } from '@/lib/appLifecycle'
import { captureExceptionThrottled } from '@/lib/throttledErrorReport'
import {
  addCalendarMonths,
  calendarMonthOf,
  roleForMonth,
} from '@/lib/roleHistory'
import { tracksHours } from '@/lib/publisherCapabilities'
import { resolveMileageUnits } from '@/features/mileage/lib/format'
import { buildWatchSnapshot } from '@/app/watch/buildWatchSnapshot'
import { planWatchEntries } from '@/app/watch/planWatchEntries'
import { planWatchTrips } from '@/app/watch/planWatchTrips'

/** Native analytics events JS may forward; anything else is dropped. */
const FORWARDED_EVENTS = new Set<string>([
  'watch_timer_action_completed',
  'siri_action_completed',
  'siri_action_failed',
] satisfies AnalyticsEventName[])
const STATUS_CAPTURED_AT_KEY = 'watchStatusCapturedAt'
/**
 * Widget kinds in `targets/watch-widgets`, which the Wear OS complications
 * reuse. Monthly Progress has a kind per circular style: Battery's ring (and
 * the other families), Weather's range gauge and the gauge with a symbol.
 */
const PROGRESS_COMPLICATION_STYLES = {
  WitnessWorkProgress: 'default',
  WitnessWorkProgressRange: 'range',
  WitnessWorkProgressSymbol: 'symbol',
} as const
const UP_NEXT_COMPLICATION = 'WitnessWorkUpNext'
/** The Wear OS tile's kind. */
const WEAR_TILE = 'WitnessWorkTile'
const STATUS_CAPTURE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

let installed = false
let lastPushedContent: string | null = null
let draining = false

/**
 * Builds the watch snapshot from the stores and hands it to the native layer,
 * which keeps it for Siri on this device and sends it to a paired Apple Watch,
 * or on Android to a Wear OS watch. Skipped when nothing in it changed since
 * the last push; the native layer also skips one it already has, so a new
 * launch or watch doesn't resend it. `reflectedEntryIds` are watch entries just
 * saved but not yet resolved.
 */
export function pushWatchSnapshot(
  reason: string,
  reflectedEntryIds: string[] = []
): void {
  perf.count('watch:push')
  if (!WatchBridge.isAvailable()) return
  // iOS keeps the snapshot for Siri even without a watch; Android only needs it
  // once a Wear OS watch has the app (`onStatusChange` sends it then).
  if (Platform.OS === 'android' && !WatchBridge.getStatus().isWatchAppInstalled)
    return

  try {
    const sr = useServiceReport.getState()
    const prefs = usePreferences.getState()
    const mileage = useMileage.getState()
    // The watch shows this month, so it uses this month's role (Role History).
    const month = calendarMonthOf()
    const publisher = roleForMonth(prefs.roleHistory, prefs.role, month)
    const nextPublisher = roleForMonth(
      prefs.roleHistory,
      prefs.role,
      addCalendarMonths(month, 1)
    )
    const snapshot = buildWatchSnapshot({
      platform: Platform.OS === 'android' ? 'android' : 'ios',
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
      mileageTrackingEnabled: prefs.mileageTrackingEnabled,
      distanceUnit: resolveMileageUnits(prefs).distanceUnit,
      vehicles: mileage.vehicles,
      trips: mileage.trips,
      reflectedEntryIds,
    })

    const { generatedAt, ...content } = snapshot
    // The watch reads `reportedToday` against the day it was built.
    const contentKey = JSON.stringify([
      new Date(generatedAt).toDateString(),
      content,
    ])
    if (contentKey === lastPushedContent) return
    WatchBridge.setSnapshot(JSON.stringify(snapshot), {
      // Wear OS may hold back the rest, e.g. a sync merged in the background.
      urgent: reason === 'watch-entries' || AppState.currentState === 'active',
    })
    lastPushedContent = contentKey
  } catch (e) {
    logger.error(`[watchSync] failed to push snapshot (${reason})`, e)
    captureExceptionThrottled('watchSync:push', e, { watchSync: reason })
  }
}

/** Failures the native layer recorded, which release builds don't log. */
function reportNativeErrors(): void {
  for (const message of WatchBridge.takeErrors()) {
    captureExceptionThrottled(
      `watchBridge:${message.split(':')[0]}`,
      new Error(`[watchBridge] ${message}`)
    )
  }
}

/**
 * Saves Time Entries and Trips made on the watch or with Siri on this device,
 * and forwards native analytics events. Each one is persisted before the native
 * layer is told it's handled, so a crash in between only causes a repeat
 * delivery, which is recognized by id.
 */
function drainInbox(): void {
  if (!WatchBridge.isAvailable() || draining) return
  draining = true
  try {
    const drafts = WatchBridge.getPendingEntries()
    const tripDrafts = WatchBridge.getPendingTrips()
    const handled: string[] = []
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
            ...(plan.origin === 'phoneShortcut'
              ? { source: 'siri' }
              : { source: 'watch', watch_origin: plan.origin }),
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
      handled.push(...plans.map((plan) => plan.id))
    }
    if (tripDrafts.length) {
      const mileage = useMileage.getState()
      const plans = planWatchTrips(tripDrafts, mileage)
      for (const plan of plans) {
        if (plan.status !== 'add') continue
        mileage.saveTrip(plan.trip)
        analytics.capture('mileage_trip_added', {
          entry_mode: 'distance',
          round_trip: !!plan.trip.roundTrip,
          has_note: false,
          logged_again: false,
          source: plan.origin === 'phoneShortcut' ? 'siri' : 'watch',
        })
      }
      handled.push(...plans.map((plan) => plan.id))
    }
    if (handled.length) {
      // Send the updated progress before the watch stops showing these
      // entries as syncing, so its total never dips. Until they're resolved
      // the watch also adds them itself, so name them as already counted.
      pushWatchSnapshot('watch-entries', handled)
      WatchBridge.resolveEntries(handled)
    }

    for (const event of WatchBridge.takeEvents()) {
      if (FORWARDED_EVENTS.has(event.name)) {
        analytics.capture(event.name as AnalyticsEventName, event.properties)
      }
    }
  } catch (e) {
    logger.error('[watchSync] failed to save watch entries', e)
    captureExceptionThrottled('watchSync:drain', e)
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
  const progressStyles = kinds
    ? Object.entries(PROGRESS_COMPLICATION_STYLES)
        .filter(([kind]) => kinds.includes(kind))
        .map(([, style]) => style)
    : undefined
  analytics.capture('watch_app_status', {
    complication_enabled: status.isComplicationEnabled,
    progress_complication: progressStyles && progressStyles.length > 0,
    progress_complication_styles: progressStyles?.join(',') || undefined,
    up_next_complication: kinds?.includes(UP_NEXT_COMPLICATION),
    // Wear OS only; the Apple Watch has no tiles.
    ...(Platform.OS === 'android' && { tile: kinds?.includes(WEAR_TILE) }),
  })
  mmkvStorage.set(STATUS_CAPTURED_AT_KEY, Date.now())
}

const debouncedPush = debounce(() => pushWatchSnapshot('store-change'), 500, {
  leading: false,
  trailing: true,
})

/**
 * Connects the stores to the watch (Apple Watch, or Wear OS on Android) and to
 * Siri on this device: saves the entries and trips they made and keeps their
 * snapshot current. Install once storage has hydrated. Idempotent; returns a
 * teardown function for tests.
 */
export function installWatchSync(): () => void {
  if (!WatchBridge.isAvailable() || installed) return () => {}
  installed = true

  const unsubscribes = [
    useServiceReport.subscribe(() => debouncedPush()),
    usePreferences.subscribe(() => debouncedPush()),
    useCategories.subscribe(() => debouncedPush()),
    useMileage.subscribe(() => debouncedPush()),
    // Up Next shows Follow-ups and their Contacts.
    useConversations.subscribe(() => debouncedPush()),
    useContacts.subscribe(() => debouncedPush()),
  ]

  // Foreground covers midnight and month rollover, language changes, and
  // entries delivered or made with Siri while JS couldn't run.
  const foregroundSub = addForegroundListener(() => {
    drainInbox()
    pushWatchSnapshot('foreground')
    captureWatchStatus()
    reportNativeErrors()
  })
  const inboxSub = WatchBridge.onInboxChange(drainInbox)
  // A newly paired watch or newly installed watch app gets the snapshot the
  // native layer keeps; this only adds one the stores changed meanwhile (on
  // Android, none is built until a watch has the app).
  const statusSub = WatchBridge.onStatusChange(() => {
    pushWatchSnapshot('status-change')
    captureWatchStatus()
  })

  drainInbox()
  pushWatchSnapshot('cold-start')
  captureWatchStatus()
  reportNativeErrors()

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe())
    debouncedPush.cancel()
    foregroundSub.remove()
    inboxSub.remove()
    statusSub.remove()
    lastPushedContent = null
    installed = false
  }
}
