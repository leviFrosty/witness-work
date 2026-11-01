import moment from 'moment'
import { perf } from '@/lib/perf'
import { useDisplayRegions } from '@/stores/displayRegions'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'
import { CommonActions } from '@react-navigation/native'
import { Alert, I18nManager, LogBox, type AlertButton } from 'react-native'
import useContacts from '@/stores/contactsStore'
import { useGeocodeRetry } from '@/stores/geocodeRetry'
import { useMapFindSkips } from '@/features/map/stores/mapFindSkips'
import { useHelpCenterStore } from '@/features/updates/stores/helpCenter'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import usePet from '@/stores/pet'
import { useRewardStack } from '@/stores/rewardStack'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { useProfileOverlay } from '@/stores/profileOverlay'
import type { JsonType } from '@posthog/core'
import {
  FeatureFlag,
  setDevFlagOverride,
  setDevFlagPayloadOverride,
} from '@/lib/featureFlags'
import { navigationRef } from '@/features/contacts/lib/linking'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesDiagnostics } from '@/features/buddies/stores/buddiesDiagnostics'
import { useUpdateRequired } from '@/lib/appUpdate'
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'
import { useUpdateRevealStore } from '@/features/updates/stores/updateReveal'
import { usePendingUpdate } from '@/features/updates/stores/pendingUpdate'
import { useMilestoneRevealStore } from '@/features/milestones/stores/milestoneReveal'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import {
  buddiesEngine,
  checkBuddiesRelay,
} from '@/features/buddies/lib/buddiesService'
import { checkCryptoVectors } from '@/features/buddies/lib/testing/cryptoVectors'
import { checkSpaceVectors } from '@/lib/sharedSpaces/testing/spaceVectors'
import { sharedCarsHarness } from '@/app/dev-harness/sharedCars'
import apis from '@/constants/apis'
import { SCENARIO_NAMES } from '@/app/dev-harness/scenarios'
import { buildTodayRouteFixture } from '@/app/dev-fixtures/todayRoute'
import { buildRouteDemoFixture } from '@/app/dev-fixtures/routeDemo'
import { useSavedPlaces } from '@/features/route-planning/stores/savedPlaces'
import { useSavedRoutes } from '@/features/route-planning/stores/savedRoutes'
import {
  cancelSeedRootReset,
  seedScenario,
} from '@/app/dev-harness/seedScenario'
import { petHarness } from '@/app/dev-harness/pet'
import { cloudSyncHarness } from '@/app/dev-harness/cloudSync'
import { appUpdateHarness } from '@/app/dev-harness/appUpdate'
import { scribeHarness } from '@/app/dev-harness/scribe'
import { getOnline, simulateOffline } from '@/lib/http/online'
import {
  isStorageLocked,
  mmkvStorage,
  simulateLockedLaunch,
} from '@/stores/mmkv'
import { reloadApp } from '@/lib/hotUpdater'
import { isNoteEditorLoaded } from '@/lib/richText/noteEditorSession'
import {
  accountHarness,
  backupHarness,
  handoffHarness,
} from '@/app/dev-harness/account'
import { backupFileHarness } from '@/app/dev-harness/backupFile'
import i18n, { _i18n, type TranslationKey } from '@/lib/locales'
import { isDevForceRtl, setDevForceRtl, syncLayoutDirection } from '@/lib/rtl'
import { iCloudSync } from '@/app/sync/iCloudSync'
import {
  badgeHarnessState,
  earnEveryBadge,
  earnRandomBadges,
  evaluateBadgesNow,
  celebrateBadge,
  offerBadge,
  recentUserAction,
  resetBadgeState,
  showBadgeHistorySummary,
  simulateBuddyBadge,
  simulateBuddyReaction,
} from '@/app/dev-harness/badges'
import { useBadgeSession } from '@/stores/badgeSession'
import { takeoverSnapshot, useTakeover } from '@/stores/takeover'
import { useSplitSheetPreferences } from '@/stores/splitSheet'
import { toast, useToasts } from '@/stores/toasts'
import { triggerDevRemount } from '@/lib/devRemount'
import { noteUserAction, type UserActionKind } from '@/lib/userAction'
import {
  devicePushToken,
  prepareBuddiesPush,
  prepareDevicePushToken,
  preparedBuddiesPush,
} from '@/app/dev-harness/buddiesPush'
import {
  setFakeGoogleDrive,
  type FakeGoogleDrive,
} from '@/lib/syncTransport/googleDrive/googleDriveAuth'

const FAKE_GOOGLE_DRIVE_KEY = 'devFakeGoogleDrive'

function applyFakeGoogleDrive(config: FakeGoogleDrive | null) {
  if (config) mmkvStorage.set(FAKE_GOOGLE_DRIVE_KEY, JSON.stringify(config))
  else mmkvStorage.delete(FAKE_GOOGLE_DRIVE_KEY)
  setFakeGoogleDrive(config)
  return config
}

function restoreFakeGoogleDrive() {
  const saved = mmkvStorage.getString(FAKE_GOOGLE_DRIVE_KEY)
  if (saved) setFakeGoogleDrive(JSON.parse(saved) as FakeGoogleDrive)
}

type CapturedError = {
  at: string
  kind: 'fatal' | 'error' | 'console'
  message: string
}

const MAX_ERRORS = 50
const errors: CapturedError[] = []

const BENIGN_CONSOLE_ERRORS = [
  /viewIsDescendantOf\(\) noop: Cannot find view with reactTag/,
]

function record(kind: CapturedError['kind'], message: string) {
  errors.push({ at: new Date().toISOString(), kind, message })
  if (errors.length > MAX_ERRORS) errors.shift()
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function captureErrors() {
  const previous = ErrorUtils.getGlobalHandler()
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    record(isFatal ? 'fatal' : 'error', describe(error))
    previous(error, isFatal)
  })
  const consoleError = console.error
  console.error = (...args: unknown[]) => {
    const message = args.map(describe).join(' ').slice(0, 2000)
    if (!BENIGN_CONSOLE_ERRORS.some((pattern) => pattern.test(message)))
      record('console', message)
    consoleError(...args)
  }
}

type OpenAlert = { title: string; buttons: string[]; cancel?: string }

const openAlerts: OpenAlert[] = []

function trackAlerts() {
  const show = Alert.alert
  Alert.alert = (title, message, buttons, options) => {
    const list: AlertButton[] = buttons ?? []
    const entry: OpenAlert = {
      title,
      buttons: list.length ? list.map((button) => button.text ?? '') : ['OK'],
      cancel: list.find((button) => button.style === 'cancel')?.text,
    }
    openAlerts.push(entry)
    const close = () => {
      const index = openAlerts.indexOf(entry)
      if (index >= 0) openAlerts.splice(index, 1)
    }
    show(
      title,
      message,
      buttons?.map((button) => ({
        ...button,
        onPress: (value?: string) => {
          close()
          ;(button.onPress as ((value?: string) => void) | undefined)?.(value)
        },
      })),
      {
        ...options,
        onDismiss: () => {
          close()
          options?.onDismiss?.()
        },
      }
    )
  }
}

let remountedFrom: unknown

function remount() {
  cancelSeedRootReset()
  remountedFrom = navigationRef.current
  triggerDevRemount()
}

function summary() {
  const preferences = usePreferences.getState()
  const reports = useServiceReport.getState()
  const timeEntries = Object.values(reports.serviceReports).flatMap((months) =>
    Object.values(months).flat()
  )
  const route = navigationRef.isReady()
    ? navigationRef.getCurrentRoute()
    : undefined
  return {
    onboarded: preferences.onboardingComplete,
    role: preferences.role,
    contacts: useContacts.getState().contacts.length,
    visits: useConversations.getState().conversations.length,
    timeEntries: timeEntries.length,
    dayPlans: reports.dayPlans.length,
    badges: Object.keys(preferences.earnedBadges).length,
    route: route ? { name: route.name, params: route.params } : null,

    stack: navigationRef.isReady()
      ? (navigationRef.getRootState()?.routes.map((r) => r.name) ?? [])
      : [],

    canGoBack: navigationRef.isReady() && navigationRef.canGoBack(),

    ready:
      navigationRef.current !== remountedFrom &&
      navigationRef.isReady() &&
      route !== undefined,
    errors: errors.length,
    apiBase: new URL(apis.apiHealth).origin,
  }
}

function seed(name: string) {
  const fakeDrive = mmkvStorage.getString(FAKE_GOOGLE_DRIVE_KEY)
  const forceRtl = isDevForceRtl()
  seedScenario(name)

  appUpdateHarness.clear()
  useUpdateRequired.setState({ required: null })
  usePendingUpdate.setState({ bundleId: null })
  if (fakeDrive) mmkvStorage.set(FAKE_GOOGLE_DRIVE_KEY, fakeDrive)

  if (forceRtl) setDevForceRtl(true)
  return summary()
}

export function installDevHarness() {
  if (!__DEV__) return
  captureErrors()
  trackAlerts()
  restoreFakeGoogleDrive()
  const harness = {
    version: 1,
    scenarios: SCENARIO_NAMES,
    seed,
    reset: () => seed('fresh'),
    state: summary,

    alerts: () => [...openAlerts],

    forgetAlerts: () => {
      openAlerts.length = 0
      return true
    },

    perf: () => perf.snapshot(),
    errors: () => [...errors],
    clearErrors: () => {
      errors.length = 0
    },

    quietLogBox: (quiet = true) => {
      LogBox.ignoreAllLogs(quiet)
      return quiet
    },
    setFlag: (flag: FeatureFlag, value: boolean | string | undefined) => {
      setDevFlagOverride(flag, value)
      return value
    },

    setFlagPayload: (flag: FeatureFlag, payload: JsonType | undefined) => {
      setDevFlagPayloadOverride(flag, payload)
      return payload
    },

    checkBuddiesRelay: () => {
      void checkBuddiesRelay()
      return 'started'
    },

    checkBuddiesCryptoVectors: () => checkCryptoVectors(),

    checkSharedSpacesCryptoVectors: () => checkSpaceVectors(),

    sharedCars: sharedCarsHarness,

    buddiesEngine,

    fakeGoogleDrive: applyFakeGoogleDrive,

    prepareBuddiesPush,
    buddiesPushPayload: preparedBuddiesPush,

    prepareDevicePushToken,
    devicePushToken,

    sync: iCloudSync,

    seedRoute: (daysFromToday = 0) => {
      const fixture = buildTodayRouteFixture({
        now: moment().add(daysFromToday, 'days'),
      })
      const contacts = useContacts.getState()
      fixture.contacts.forEach((contact) => {
        if (contacts.deletedContacts.some((c) => c.id === contact.id)) {
          contacts.removeDeletedContact(contact.id)
        }
        contacts.addContact(contact)
      })
      fixture.visits.forEach(useConversations.getState().addConversation)
      fixture.dayPlans.forEach((plan) =>
        useServiceReport.getState().addDayPlan(plan)
      )
      fixture.recurringPlans.forEach((plan) =>
        useServiceReport.getState().addRecurringPlan(plan)
      )
      return fixture.visits.length + fixture.dayPlans.length
    },

    seedRouteDemo: (daysFromToday = 1) => {
      const fixture = buildRouteDemoFixture({
        day: moment().add(daysFromToday, 'days'),
      })
      fixture.contacts.forEach(useContacts.getState().addContact)
      fixture.visits.forEach(useConversations.getState().addConversation)
      fixture.dayPlans.forEach((plan) =>
        useServiceReport.getState().addDayPlan(plan)
      )
      return fixture.visits.length + fixture.dayPlans.length
    },
    setSupporter: (on: boolean) => {
      usePreferences
        .getState()
        .set({ devSupporterOverride: on ? new Date() : null })
      return on
    },

    noteUserAction: (kind: UserActionKind = 'dev') => noteUserAction(kind),

    takeover: {
      state: () => takeoverSnapshot(),
      store: useTakeover,
    },

    badges: {
      evaluate: (quiet = false) =>
        evaluateBadgesNow({ quiet, action: recentUserAction() }),
      celebrate: offerBadge,
      moment: celebrateBadge,
      history: (count = 5) => showBadgeHistorySummary(count),
      earnAll: () => {
        earnEveryBadge()
        return badgeHarnessState()
      },
      earnRandom: () => {
        earnRandomBadges()
        return badgeHarnessState()
      },
      reset: () => {
        resetBadgeState()
        return badgeHarnessState()
      },
      state: badgeHarnessState,
      simulateBuddyBadge: () => simulateBuddyBadge(),

      simulateBuddyReaction: (badgeKey?: string, emoji?: string) =>
        simulateBuddyReaction(badgeKey, emoji),
    },

    account: accountHarness,

    handoff: handoffHarness,

    backup: backupHarness,

    backupFile: backupFileHarness,

    cloudSync: cloudSyncHarness,

    appUpdate: appUpdateHarness,

    pet: petHarness,

    scribe: scribeHarness,

    network: {
      offline: (on = true) => simulateOffline(on),
      state: getOnline,
    },

    layoutDirection: {
      forceRtl: (on: boolean) => {
        setDevForceRtl(on)
        syncLayoutDirection(_i18n.locale)
        return { rtl: I18nManager.isRTL, forceRtl: isDevForceRtl() }
      },
      state: () => ({
        rtl: I18nManager.isRTL,
        forceRtl: isDevForceRtl(),
        locale: _i18n.locale,
      }),
    },

    displayRegions: () => useDisplayRegions.getState().regions,

    t: (key: string, options?: Record<string, unknown>) =>
      i18n.t(key as TranslationKey, options),

    simulateLockedLaunch: () => {
      simulateLockedLaunch()
      void reloadApp()
      return true
    },
    storageLocked: isStorageLocked,

    noteEditorLoaded: isNoteEditorLoaded,

    remount: () => {
      remount()
      return true
    },
    navigate: (name: string, params?: object) => {
      if (!navigationRef.isReady()) throw new Error('Navigation is not ready')
      navigationRef.dispatch(CommonActions.navigate({ name, params }))
      return summary().route
    },
    stores: {
      preferences: usePreferences,
      profile: useProfile,
      contacts: useContacts,

      geocodeRetry: useGeocodeRetry,

      mapFindSkips: useMapFindSkips,

      helpCenter: useHelpCenterStore,
      conversations: useConversations,
      serviceReports: useServiceReport,
      mileage: useMileage,

      sharedCars: useSharedCars,

      savedRoutes: useSavedRoutes,
      savedPlaces: useSavedPlaces,

      pet: usePet,

      rewardStack: useRewardStack,
      categories: useCategories,
      buddies: useBuddies,
      buddiesDiagnostics: useBuddiesDiagnostics,

      notificationsTray: useNotificationsTray,

      streakCelebration: useStreakCelebration,
      calendarSync: useCalendarSync,
      calendarPublishing: useCalendarPublishing,
      badgeSession: useBadgeSession,
      takeover: useTakeover,

      profileOverlay: useProfileOverlay,
      splitSheet: useSplitSheetPreferences,

      appLock: useAppLockSettings,

      updateRequired: useUpdateRequired,
      appLockSession: useAppLockSession,

      updateReveal: useUpdateRevealStore,

      pendingUpdate: usePendingUpdate,

      milestoneReveal: useMilestoneRevealStore,

      toast,
      toasts: useToasts,
    },
  }
  ;(globalThis as { __WW_DEV__?: typeof harness }).__WW_DEV__ = harness
}
