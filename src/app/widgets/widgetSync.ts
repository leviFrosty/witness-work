import { AppState, AppStateStatus, Platform } from 'react-native'
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
import { iCloudSync } from '@/app/sync/iCloudSync'

export const WIDGET_REFRESH_TASK = 'com.leviwilkerson.jwtime.widget.refresh'

let installed = false

/**
 * Reads the current zustand state synchronously and pushes a freshly built
 * widget snapshot into the iOS App Group container, then asks WidgetKit to
 * reload all timelines. Safe to call from React effects, AppState handlers, and
 * background fetch tasks alike — none of these go through React.
 */
function pushSnapshot(reason: string): void {
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
      publisher: prefs.role,
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
      locale: prefs.locale ?? DEFAULT_LOCALE,
      accentColor,
    })

    WidgetBridge.writeSnapshot(JSON.stringify(snapshot))
    WidgetBridge.reloadAllTimelines()
  } catch (e) {
    logger.error(`[widgetSync] failed to push snapshot (${reason})`, e)
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
    pushSnapshot('background-fetch')
    // Piggyback on the widget-refresh task to pull any remote iCloud updates
    // and push pending local writes. Gated on the sync opt-in so it's a
    // no-op when the feature is off. Errors are handled inside the sync
    // layer — don't let them fail the widget task.
    try {
      await iCloudSync.pullAndMerge('background-fetch')
      await iCloudSync.push('background-fetch')
    } catch (e) {
      logger.error('[widgetSync] iCloud sync in background task failed', e)
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

  // 1. Subscribe to relevant zustand stores. Each write debounces a push.
  const unsubServiceReport = useServiceReport.subscribe(() => debouncedPush())
  const unsubPreferences = usePreferences.subscribe(() => debouncedPush())
  const unsubContacts = useContacts.subscribe(() => debouncedPush())
  const unsubConversations = useConversations.subscribe(() => debouncedPush())
  // Supporter status flips the accent gate on/off — re-push when it changes so
  // a newly-active supporter's custom accent appears in widgets without
  // waiting for the next unrelated store write.
  const unsubSupporter = useSupporter.subscribe(() => debouncedPush())

  // 2. Foreground rewrite — covers locale switches, midnight rollover, and
  //    any other state that changes while the app was backgrounded.
  const onAppState = (state: AppStateStatus) => {
    if (state === 'active') pushSnapshot('foreground')
  }
  const appStateSub = AppState.addEventListener('change', onAppState)

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
    appStateSub.remove()
    BackgroundTask.unregisterTaskAsync(WIDGET_REFRESH_TASK).catch(() => {})
    installed = false
  }
}
