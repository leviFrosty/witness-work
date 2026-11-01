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
import { nativeLocale } from '@/lib/nativeLocale'
import { buildWidgetSnapshot } from '@/app/widgets/snapshot'
import { flushWatchSnapshot } from '@/app/watch/watchSync'
import { logger } from '@/lib/logger'
import {
  addCalendarMonths,
  calendarMonthOf,
  roleForMonth,
} from '@/lib/roleHistory'
import { iCloudSync } from '@/app/sync/iCloudSync'
import { isStorageLocked, mmkvStorage } from '@/stores/mmkv'
import { addForegroundListener } from '@/lib/appLifecycle'
import { contentHash } from '@/lib/contentHash'
import { captureExceptionThrottled } from '@/lib/throttledErrorReport'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { currentBuddyDayMarkers } from '@/features/buddies/lib/currentBuddyDayMarkers'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import { usePet } from '@/stores/pet'
import type * as SkiaImage from '@/features/pet/render/skiaImage'
import { planPetWidgetSnapshot } from '@/app/widgets/petWidgetInput'
import { renderPetWidget } from '@/app/widgets/petWidget'
import { createPetWidgetWriter } from '@/app/widgets/petWidgetWriter'

export const WIDGET_REFRESH_TASK = 'com.leviwilkerson.jwtime.widget.refresh'

let installed = false

const BUDDIES_ENABLED_KEY = 'widgetBuddiesEnabled'

const SNAPSHOT_HASH_KEY = 'widgetSnapshotHash'

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
  'showStreaks',
] as const satisfies (keyof ReturnType<typeof usePreferences.getState>)[]

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
    logger.warn('[widgetSync] buddy markers unavailable', e)
    return {}
  }
}

const petWriter = createPetWidgetWriter({
  storage: mmkvStorage,
  bridge: WidgetBridge,
  render: (plan) => {
    const {
      bufferToPngBase64,
    }: typeof SkiaImage = require('@/features/pet/render/skiaImage')
    return renderPetWidget(plan, bufferToPngBase64)
  },
  onError: (message, error) => {
    logger.error(`[widgetSync] ${message}`, error)
    captureExceptionThrottled('widgetSync:pet', error)
  },
})

let pushQueue: Promise<void> = Promise.resolve()

function pushSnapshot(reason: string): Promise<void> {
  pushQueue = pushQueue.then(() => pushSnapshotNow(reason))
  return pushQueue
}

async function pushSnapshotNow(reason: string): Promise<void> {
  perf.count('widget:push')
  if (!WidgetBridge.isAvailable()) return

  try {
    const sr = useServiceReport.getState()
    const prefs = usePreferences.getState()
    const contactsState = useContacts.getState()
    const conversationsState = useConversations.getState()
    const { isSupporter } = useSupporter.getState()

    const defaultPhoneRegionCode = getLocales()[0]?.regionCode ?? ''

    const accentColor = isSupporter ? (prefs.customAccentColor ?? null) : null

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

    const pet = await petWriter.prepare(() =>
      planPetWidgetSnapshot(new Date(), {
        deviceRegion: defaultPhoneRegionCode || null,
      })
    )

    const snapshot = buildWidgetSnapshot({
      serviceReports: sr.serviceReports,

      publisher: roleForMonth(prefs.roleHistory, prefs.role, calendarMonthOf()),
      nextMonthPublisher: roleForMonth(
        prefs.roleHistory,
        prefs.role,
        addCalendarMonths(calendarMonthOf(), 1)
      ),
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
      nativeLocale: nativeLocale(language),
      accentColor,
      pet: pet.snapshot,
    })

    const { updatedAt: _updatedAt, ...content } = snapshot
    const hash = contentHash(JSON.stringify(content))
    if (hash === mmkvStorage.getString(SNAPSHOT_HASH_KEY)) {
      petWriter.unchanged(pet)
      perf.count('widget:skip')
      return
    }
    WidgetBridge.writeSnapshot(JSON.stringify(snapshot))
    try {
      mmkvStorage.set(SNAPSHOT_HASH_KEY, hash)
    } catch (e) {
      captureExceptionThrottled('widgetSync:hash', e)
    }
    perf.count('widget:reload')
    WidgetBridge.reloadAllTimelines()
    await petWriter.written(pet)
  } catch (e) {
    logger.error(`[widgetSync] failed to push snapshot (${reason})`, e)
    captureExceptionThrottled('widgetSync', e, { widgetSync: reason })
  }
}

const debouncedPush = debounce(() => pushSnapshot('store-change'), 500, {
  leading: false,
  trailing: true,
})

if (Platform.OS === 'ios' && !TaskManager.isTaskDefined(WIDGET_REFRESH_TASK)) {
  TaskManager.defineTask(WIDGET_REFRESH_TASK, async () => {
    if (isStorageLocked()) return BackgroundTask.BackgroundTaskResult.Success

    try {
      await iCloudSync.pullAndMerge('background-fetch')
      await iCloudSync.push('background-fetch')
    } catch (e) {
      logger.error('[widgetSync] iCloud sync in background task failed', e)
    } finally {
      debouncedPush.cancel()
      await pushSnapshot('background-fetch')

      flushWatchSnapshot('background-fetch')
    }
    return BackgroundTask.BackgroundTaskResult.Success
  })
}

export function installWidgetSync(): () => void {
  if (Platform.OS !== 'ios') return () => {}
  if (installed) return () => {}
  installed = true

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

  const unsubSupporter = useSupporter.subscribe((state, previous) => {
    if (state.isSupporter !== previous.isSupporter) debouncedPush()
  })

  const unsubPet = usePet.subscribe((state, previous) => {
    if (state.pet !== previous.pet || state.room !== previous.room)
      debouncedPush()
  })
  const unsubBuddies = useBuddies.subscribe((state, previous) => {
    if (
      state.buddies !== previous.buddies ||
      state.sharing.showOnCalendar !== previous.sharing.showOnCalendar ||
      state.cards !== previous.cards ||
      state.shareReplies !== previous.shareReplies ||
      state.incomingShares !== previous.incomingShares ||
      state.registeredInboxId !== previous.registeredInboxId
    )
      debouncedPush()
  })

  const foregroundSub = addForegroundListener(() => pushSnapshot('foreground'))

  pushSnapshot('cold-start')

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
    unsubPet()
    debouncedPush.cancel()
    foregroundSub.remove()
    BackgroundTask.unregisterTaskAsync(WIDGET_REFRESH_TASK).catch(() => {})
    installed = false
  }
}
