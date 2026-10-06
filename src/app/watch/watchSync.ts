import { AppState, AppStateStatus } from 'react-native'
import debounce from 'lodash/debounce'
import * as WatchBridge from '../../../modules/watch-bridge'
import { useServiceReport } from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useConversations } from '@/stores/conversationStore'
import useCategories from '@/stores/categories'
import useMileage from '@/stores/mileage'
import { mmkvStorage } from '@/stores/mmkv'
import { analytics } from '@/lib/analytics'
import type { AnalyticsEventName } from '@/lib/analyticsEvents'
import { logger } from '@/lib/logger'
import { calendarMonthOf, roleForMonth } from '@/lib/roleHistory'
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
const STATUS_CAPTURE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

let installed = false
let lastPushedContent: string | null = null
let draining = false

/**
 * Builds the watch snapshot from the stores and hands it to the native layer,
 * which keeps it for Siri on this device and sends it to a paired Apple Watch.
 * Skipped when nothing in it changed, unless `force`d.
 */
export function pushWatchSnapshot(reason: string, force = false): void {
  if (!WatchBridge.isAvailable()) return

  try {
    const sr = useServiceReport.getState()
    const prefs = usePreferences.getState()
    const mileage = useMileage.getState()
    // The watch shows this month, so it uses this month's role (Role History).
    const publisher = roleForMonth(
      prefs.roleHistory,
      prefs.role,
      calendarMonthOf()
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
      showsTimeEntry: tracksHours(publisher, prefs.logsHours),
      categories: useCategories.getState().categories,
      mileageTrackingEnabled: prefs.mileageTrackingEnabled,
      distanceUnit: resolveMileageUnits(prefs).distanceUnit,
      vehicles: mileage.vehicles,
      trips: mileage.trips,
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
      // entries as syncing, so its total never dips.
      pushWatchSnapshot('watch-entries', true)
      WatchBridge.resolveEntries(handled)
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
  analytics.capture('watch_app_status', {
    complication_enabled: status.isComplicationEnabled,
  })
  mmkvStorage.set(STATUS_CAPTURED_AT_KEY, Date.now())
}

const debouncedPush = debounce(() => pushWatchSnapshot('store-change'), 500, {
  leading: false,
  trailing: true,
})

/**
 * Connects the stores to the Apple Watch and to Siri on this device: saves the
 * entries and trips they made and keeps their snapshot current. Install once
 * storage has hydrated. Idempotent; returns a teardown function for tests.
 */
export function installWatchSync(): () => void {
  if (!WatchBridge.isAvailable() || installed) return () => {}
  installed = true

  const unsubscribes = [
    useServiceReport.subscribe(() => debouncedPush()),
    usePreferences.subscribe(() => debouncedPush()),
    useCategories.subscribe(() => debouncedPush()),
    useMileage.subscribe(() => debouncedPush()),
  ]

  // Foreground covers midnight and month rollover, language changes, and
  // entries delivered or made with Siri while JS couldn't run.
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
