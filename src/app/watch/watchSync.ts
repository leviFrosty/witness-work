import { perf } from '@/lib/perf'
import { AppState, Platform } from 'react-native'
import debounce from 'lodash/debounce'
import { shallow } from 'zustand/shallow'
import * as WatchBridge from '../../../modules/watch-bridge'
import { useServiceReport } from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useConversations } from '@/stores/conversationStore'
import useContacts from '@/stores/contactsStore'
import useCategories from '@/stores/categories'
import { getMileageView, subscribeMileageView } from '@/stores/mileageView'
import { saveTrip } from '@/stores/mileageWrites'
import useSharedCars from '@/stores/sharedCars'
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
import { timeEntryMode } from '@/lib/serviceReport'
import { tripsLoggedByMe } from '@/lib/mileage/people'
import { resolveMileageUnits } from '@/features/mileage/lib/format'
import { buildWatchSnapshot } from '@/app/watch/buildWatchSnapshot'
import { _i18n } from '@/lib/locales'
import { nativeLocale } from '@/lib/nativeLocale'
import { planWatchEntries } from '@/app/watch/planWatchEntries'
import { planWatchTrips } from '@/app/watch/planWatchTrips'

const FORWARDED_EVENTS = new Set<string>([
  'watch_timer_action_completed',
  'siri_action_completed',
  'siri_action_failed',
] satisfies AnalyticsEventName[])
const STATUS_CAPTURED_AT_KEY = 'watchStatusCapturedAt'

const PROGRESS_COMPLICATION_STYLES = {
  WitnessWorkProgress: 'default',
  WitnessWorkProgressRange: 'range',
  WitnessWorkProgressSymbol: 'symbol',
} as const
const UP_NEXT_COMPLICATION = 'WitnessWorkUpNext'

const WEAR_TILE = 'WitnessWorkTile'
const STATUS_CAPTURE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

let installed = false
let lastPushedContent: string | null = null
let draining = false

const watchPreferences = (
  prefs: ReturnType<typeof usePreferences.getState>
) => ({
  role: prefs.role,
  roleHistory: prefs.roleHistory,
  publisherHours: prefs.publisherHours,
  monthlyGoalOverrides: prefs.monthlyGoalOverrides,
  overrideCreditLimit: prefs.overrideCreditLimit,
  customCreditLimitHours: prefs.customCreditLimitHours,
  timeDisplayFormat: prefs.timeDisplayFormat,
  logsHours: prefs.logsHours,
  mileageTrackingEnabled: prefs.mileageTrackingEnabled,
  distanceUnit: prefs.distanceUnit,
  fuelEconomyUnit: prefs.fuelEconomyUnit,
  locale: prefs.locale,
  formatRegion: prefs.formatRegion,
  startOfWeek: prefs.startOfWeek,
  timeFormat: prefs.timeFormat,
  dateOrder: prefs.dateOrder,
})

export function pushWatchSnapshot(
  reason: string,
  reflectedEntryIds: string[] = []
): void {
  perf.count('watch:push')
  if (!WatchBridge.isAvailable()) return

  if (Platform.OS === 'android' && !WatchBridge.getStatus().isWatchAppInstalled)
    return

  try {
    const sr = useServiceReport.getState()
    const prefs = watchPreferences(usePreferences.getState())
    const mileage = getMileageView()

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
      trips: tripsLoggedByMe(mileage.trips, useSharedCars.getState().cars),
      reflectedEntryIds,
      nativeLocale: nativeLocale(_i18n.locale),
    })

    const { generatedAt, ...content } = snapshot

    const contentKey = JSON.stringify([
      new Date(generatedAt).toDateString(),
      content,
    ])
    if (contentKey === lastPushedContent) return
    WatchBridge.setSnapshot(JSON.stringify(snapshot), {
      urgent: reason === 'watch-entries' || AppState.currentState === 'active',
    })
    lastPushedContent = contentKey
  } catch (e) {
    logger.error(`[watchSync] failed to push snapshot (${reason})`, e)
    captureExceptionThrottled('watchSync:push', e, { watchSync: reason })
  }
}

function reportNativeErrors(): void {
  for (const message of WatchBridge.takeErrors()) {
    captureExceptionThrottled(
      `watchBridge:${message.split(':')[0]}`,
      new Error(`[watchBridge] ${message}`)
    )
  }
}

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
            entry_mode: timeEntryMode(plan.entry),
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
      const view = getMileageView()
      const plans = planWatchTrips(tripDrafts, {
        ...view,
        ownTrips: tripsLoggedByMe(view.trips, useSharedCars.getState().cars),
      })
      for (const plan of plans) {
        if (plan.status !== 'add' || !saveTrip(plan.trip)) continue
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

function captureWatchStatus(): void {
  const status = WatchBridge.getStatus()
  if (!status.isWatchAppInstalled) return
  const capturedAt = mmkvStorage.getNumber(STATUS_CAPTURED_AT_KEY) ?? 0
  if (Date.now() - capturedAt < STATUS_CAPTURE_INTERVAL_MS) return
  try {
    mmkvStorage.set(STATUS_CAPTURED_AT_KEY, Date.now())
  } catch (e) {
    captureExceptionThrottled('watchSync:status', e)
    return
  }

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

    ...(Platform.OS === 'android' && { tile: kinds?.includes(WEAR_TILE) }),
  })
}

const debouncedPush = debounce(() => pushWatchSnapshot('store-change'), 500, {
  leading: false,
  trailing: true,
})

export function flushWatchSnapshot(reason: string): void {
  debouncedPush.cancel()
  pushWatchSnapshot(reason)
}

export function installWatchSync(): () => void {
  if (!WatchBridge.isAvailable() || installed) return () => {}
  installed = true

  const unsubscribes = [
    useServiceReport.subscribe(() => debouncedPush()),
    usePreferences.subscribe((state, prev) => {
      if (!shallow(watchPreferences(state), watchPreferences(prev)))
        debouncedPush()
    }),
    useCategories.subscribe(() => debouncedPush()),
    subscribeMileageView(() => debouncedPush()),

    useConversations.subscribe(() => debouncedPush()),
    useContacts.subscribe(() => debouncedPush()),
  ]

  const foregroundSub = addForegroundListener(() => {
    drainInbox()
    pushWatchSnapshot('foreground')
    captureWatchStatus()
    reportNativeErrors()
  })

  const appStateSub = AppState.addEventListener('change', (state) => {
    if (state !== 'active') debouncedPush.flush()
  })
  const inboxSub = WatchBridge.onInboxChange(drainInbox)

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
    appStateSub.remove()
    inboxSub.remove()
    statusSub.remove()
    lastPushedContent = null
    installed = false
  }
}
