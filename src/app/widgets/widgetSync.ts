import { perf } from '@/lib/perf'
import { Platform } from 'react-native'
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import debounce from 'lodash/debounce'
import { getLocales } from 'expo-localization'
import * as WidgetBridge from '../../../modules/widget-bridge'
import { useServiceReport } from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useContacts } from '@/stores/contactsStore'
import { useConversations } from '@/stores/conversationStore'
import { useSupporter } from '@/features/supporter/stores/supporter'
import {
  DEFAULT_LOCALE,
  formatLocaleForMoment,
  handleLangFallback,
} from '@/lib/locales'
import { applyFormatRegion, resolveStartOfWeek } from '@/lib/dates'
import { buildWidgetSnapshot } from '@/app/widgets/snapshot'
import { logger } from '@/lib/logger'
import { calendarMonthOf, roleForMonth } from '@/lib/roleHistory'
import { iCloudSync } from '@/app/sync/iCloudSync'
import { mmkvStorage } from '@/stores/mmkv'
import { addForegroundListener } from '@/lib/appLifecycle'
import { contentHash } from '@/lib/contentHash'
import { captureExceptionThrottled } from '@/lib/throttledErrorReport'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { currentBuddyDayMarkers } from '@/features/buddies/lib/currentBuddyDayMarkers'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'

export const WIDGET_REFRESH_TASK = 'com.leviwilkerson.jwtime.widget.refresh'

let installed = false

/**
 * Whether Buddies shows in the app, remembered for widget pushes made while
 * feature flags are unknown (backgrounded, offline, or a background task).
 */
const BUDDIES_ENABLED_KEY = 'widgetBuddiesEnabled'
/** The last snapshot written, without its `updatedAt`. */
const SNAPSHOT_HASH_KEY = 'widgetSnapshotHash'

/** The preferences `pushSnapshot` reads; other preference writes are ignored. */
const WIDGET_PREFERENCES = [
  'customAccentColor',
  'locale',
  'formatRegion',
  'startOfWeek',
  'timeFormat',
  'dateOrder',
  'role',
  'roleHistory',
  'logsHours',
  'publisherHours',
  'monthlyGoalOverrides',
  'overrideCreditLimit',
  'customCreditLimitHours',
  'timeDisplayFormat',
  'defaultNavigationMapProvider',
  'stalenessBreakpoints',
  'widgetContactSort',
  'widgetContactAction',
  'widgetAppointmentWindow',
] as const satisfies (keyof ReturnType<typeof usePreferences.getState>)[]

/** Called from React whenever the app knows whether Buddies is shown. */
export function setWidgetBuddiesEnabled(enabled: boolean): void {
  if (mmkvStorage.getBoolean(BUDDIES_ENABLED_KEY) === enabled) return
  mmkvStorage.set(BUDDIES_ENABLED_KEY, enabled)
  debouncedPush()
}

function buddyMarkers(): Record<string, BuddyDayMarker> {
  if (!mmkvStorage.getBoolean(BUDDIES_ENABLED_KEY)) return {}
  try {
    return currentBuddyDayMarkers({
      ...useBuddies.getState(),
      dayPlans: useServiceReport.getState().dayPlans,
    })
  } catch (e) {
    // E.g. the identity seed is unreadable in a background task; the rest of
    // the snapshot still goes out.
    logger.warn('[widgetSync] buddy markers unavailable', e)
    return {}
  }
}

/**
 * Reads the current zustand state synchronously and pushes a freshly built
 * widget snapshot into the iOS App Group container, then asks WidgetKit to
 * reload all timelines. Skipped when the snapshot is the one already written,
 * since timeline reloads come out of a daily budget. Safe to call from React
 * effects, AppState handlers, and background fetch tasks alike — none of these
 * go through React.
 */
function pushSnapshot(reason: string): void {
  perf.count('widget:push')
  if (!WidgetBridge.isAvailable()) return

  try {
    const sr = useServiceReport.getState()
    const prefs = usePreferences.getState()
    const contactsState = useContacts.getState()
    const conversationsState = useConversations.getState()
    const { isSupporter } = useSupporter.getState()

    // Region code lives outside any of our stores; pull from device locale.
    // Used as a fallback when a contact's phone has no `phoneRegionCode`.
    const defaultPhoneRegionCode = getLocales()[0]?.regionCode ?? ''

    // Gate custom accent on supporter status — mirrors `ThemeProvider`, so a
    // lapsed supporter's preference stops taking effect in widgets too.
    const accentColor = isSupporter ? (prefs.customAccentColor ?? null) : null

    // Re-apply Language + Format Region to moment before building. The
    // background-refresh task can run in a fresh JS context where only the
    // module-load default was applied — without this, background snapshots
    // revert to US formatting (ADR 0006).
    const { locale: language } = handleLangFallback(
      prefs.locale ?? getLocales()[0].languageTag.toLowerCase()
    )
    applyFormatRegion({
      language: formatLocaleForMoment(language),
      region: prefs.formatRegion,
      startOfWeekOverride: prefs.startOfWeek,
      timeFormatOverride: prefs.timeFormat,
      dateOrderOverride: prefs.dateOrder,
    })

    const snapshot = buildWidgetSnapshot({
      serviceReports: sr.serviceReports,
      // Widgets show this month, so they use this month's role (Role History).
      publisher: roleForMonth(prefs.roleHistory, prefs.role, calendarMonthOf()),
      logsHours: prefs.logsHours,
      publisherHours: prefs.publisherHours,
      monthlyGoalOverrides: prefs.monthlyGoalOverrides,
      overrideCreditLimit: prefs.overrideCreditLimit,
      customCreditLimitHours: prefs.customCreditLimitHours,
      timeDisplayFormat: prefs.timeDisplayFormat,
      dayPlans: sr.dayPlans,
      recurringPlans: sr.recurringPlans,
      contacts: contactsState.contacts,
      conversations: conversationsState.conversations,
      defaultNavigationMapProvider: prefs.defaultNavigationMapProvider,
      defaultPhoneRegionCode,
      stalenessBreakpoints: prefs.stalenessBreakpoints,
      widgetContactSort: prefs.widgetContactSort,
      widgetContactAction: prefs.widgetContactAction,
      widgetAppointmentWindow: prefs.widgetAppointmentWindow,
      startOfWeek: resolveStartOfWeek({
        override: prefs.startOfWeek,
        region: prefs.formatRegion,
      }),
      buddyMarkers: buddyMarkers(),
      locale: prefs.locale ?? DEFAULT_LOCALE,
      accentColor,
    })

    const { updatedAt: _updatedAt, ...content } = snapshot
    const hash = contentHash(JSON.stringify(content))
    if (hash === mmkvStorage.getString(SNAPSHOT_HASH_KEY)) {
      perf.count('widget:skip')
      return
    }
    WidgetBridge.writeSnapshot(JSON.stringify(snapshot))
    perf.count('widget:reload')
    WidgetBridge.reloadAllTimelines()
    mmkvStorage.set(SNAPSHOT_HASH_KEY, hash)
  } catch (e) {
    logger.error(`[widgetSync] failed to push snapshot (${reason})`, e)
    captureExceptionThrottled('widgetSync', e, { widgetSync: reason })
  }
}

const debouncedPush = debounce(() => pushSnapshot('store-change'), 500, {
  leading: false,
  trailing: true,
})

// Define the background fetch task at module load so iOS can resolve it after
// cold boot. Idempotent — TaskManager dedupes by name.
if (Platform.OS === 'ios' && !TaskManager.isTaskDefined(WIDGET_REFRESH_TASK)) {
  TaskManager.defineTask(WIDGET_REFRESH_TASK, async () => {
    // Piggyback on the widget-refresh task to pull any remote iCloud updates
    // and push pending local writes. Gated on the sync opt-in so it's a
    // no-op when the feature is off. Errors are handled inside the sync
    // layer — don't let them fail the widget task.
    try {
      await iCloudSync.pullAndMerge('background-fetch')
      await iCloudSync.push('background-fetch')
    } catch (e) {
      logger.error('[widgetSync] iCloud sync in background task failed', e)
    } finally {
      // After the pull, so one push carries what it merged; the store-change
      // debounce might not fire before the task is suspended.
      debouncedPush.cancel()
      pushSnapshot('background-fetch')
    }
    return BackgroundTask.BackgroundTaskResult.Success
  })
}

/**
 * Wires the snapshot writer into store changes, foreground transitions, and a
 * periodic background fetch task. Idempotent: safe to call once on app boot.
 *
 * Returns a teardown function for tests; production callers can ignore it.
 */
export function installWidgetSync(): () => void {
  if (Platform.OS !== 'ios') return () => {}
  if (installed) return () => {}
  installed = true

  // 1. Subscribe to the slices the snapshot reads. Each change debounces a
  //    push. Sync bookkeeping writes preferences often; those are ignored.
  const unsubServiceReport = useServiceReport.subscribe((state, previous) => {
    if (
      state.serviceReports !== previous.serviceReports ||
      state.dayPlans !== previous.dayPlans ||
      state.recurringPlans !== previous.recurringPlans
    )
      debouncedPush()
  })
  const unsubPreferences = usePreferences.subscribe((state, previous) => {
    if (WIDGET_PREFERENCES.some((key) => state[key] !== previous[key]))
      debouncedPush()
  })
  const unsubContacts = useContacts.subscribe((state, previous) => {
    if (state.contacts !== previous.contacts) debouncedPush()
  })
  const unsubConversations = useConversations.subscribe((state, previous) => {
    if (state.conversations !== previous.conversations) debouncedPush()
  })
  // Supporter status flips the accent gate on/off — re-push when it changes so
  // a newly-active supporter's custom accent appears in widgets without
  // waiting for the next unrelated store write.
  const unsubSupporter = useSupporter.subscribe((state, previous) => {
    if (state.isSupporter !== previous.isSupporter) debouncedPush()
  })
  // Only the slices the calendar's buddy badges read; the store also holds
  // notifications and sync bookkeeping that change far more often.
  const unsubBuddies = useBuddies.subscribe((state, previous) => {
    if (
      state.buddies !== previous.buddies ||
      state.cards !== previous.cards ||
      state.shareReplies !== previous.shareReplies ||
      state.incomingShares !== previous.incomingShares ||
      state.registeredInboxId !== previous.registeredInboxId
    )
      debouncedPush()
  })

  // 2. Foreground rewrite — covers locale switches, midnight rollover, and
  //    any other state that changes while the app was backgrounded. Written
  //    only when that changed the snapshot.
  const foregroundSub = addForegroundListener(() => pushSnapshot('foreground'))

  // 3. Initial push on cold start so the widget reflects current data even if
  //    the user never interacts with the app this session.
  pushSnapshot('cold-start')

  // 4. Register the background fetch task. iOS treats minimumInterval as a
  //    hint, not a guarantee. 1h is a reasonable lower bound.
  BackgroundTask.registerTaskAsync(WIDGET_REFRESH_TASK, {
    minimumInterval: 60,
  }).catch((e) => {
    logger.error('[widgetSync] failed to register background task', e)
  })

  return () => {
    unsubServiceReport()
    unsubPreferences()
    unsubContacts()
    unsubConversations()
    unsubSupporter()
    unsubBuddies()
    debouncedPush.cancel()
    foregroundSub.remove()
    BackgroundTask.unregisterTaskAsync(WIDGET_REFRESH_TASK).catch(() => {})
    installed = false
  }
}
