import { AppState, AppStateStatus, Platform } from 'react-native'
import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import _ from 'lodash'
import { getLocales } from 'expo-localization'
import * as WidgetBridge from '../../../modules/widget-bridge'
import { useServiceReport } from '../../stores/serviceReport'
import { usePreferences } from '../../stores/preferences'
import { useContacts } from '../../stores/contactsStore'
import { useConversations } from '../../stores/conversationStore'
import { DEFAULT_LOCALE } from '../locales'
import { buildWidgetSnapshot } from './snapshot'
import { logger } from '../logger'

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

    // Region code lives outside any of our stores; pull from device locale.
    // Used as a fallback when a contact's phone has no `phoneRegionCode`.
    const defaultPhoneRegionCode = getLocales()[0]?.regionCode ?? ''

    const snapshot = buildWidgetSnapshot({
      serviceReports: sr.serviceReports,
      publisher: prefs.publisher,
      publisherHours: prefs.publisherHours,
      overrideCreditLimit: prefs.overrideCreditLimit,
      customCreditLimitHours: prefs.customCreditLimitHours,
      timeDisplayFormat: prefs.timeDisplayFormat,
      dayPlans: sr.dayPlans,
      recurringPlans: sr.recurringPlans,
      contacts: contactsState.contacts,
      conversations: conversationsState.conversations,
      defaultNavigationMapProvider: prefs.defaultNavigationMapProvider,
      defaultPhoneRegionCode,
      locale: prefs.locale ?? DEFAULT_LOCALE,
    })

    WidgetBridge.writeSnapshot(JSON.stringify(snapshot))
    WidgetBridge.reloadAllTimelines()
  } catch (e) {
    logger.error(`[widgetSync] failed to push snapshot (${reason})`, e)
  }
}

const debouncedPush = _.debounce(() => pushSnapshot('store-change'), 500, {
  leading: false,
  trailing: true,
})

// Define the background fetch task at module load so iOS can resolve it after
// cold boot. Idempotent — TaskManager dedupes by name.
if (Platform.OS === 'ios' && !TaskManager.isTaskDefined(WIDGET_REFRESH_TASK)) {
  TaskManager.defineTask(WIDGET_REFRESH_TASK, async () => {
    pushSnapshot('background-fetch')
    return BackgroundFetch.BackgroundFetchResult.NewData
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
  BackgroundFetch.registerTaskAsync(WIDGET_REFRESH_TASK, {
    minimumInterval: 60 * 60,
    stopOnTerminate: false,
    startOnBoot: false,
  }).catch((e) => {
    logger.error('[widgetSync] failed to register background task', e)
  })

  return () => {
    unsubServiceReport()
    unsubPreferences()
    unsubContacts()
    unsubConversations()
    appStateSub.remove()
    BackgroundFetch.unregisterTaskAsync(WIDGET_REFRESH_TASK).catch(() => {})
    installed = false
  }
}
