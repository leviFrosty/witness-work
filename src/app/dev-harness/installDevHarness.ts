import { perf } from '@/lib/perf'
import { CommonActions } from '@react-navigation/native'
import { LogBox } from 'react-native'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useMileage from '@/stores/mileage'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { FeatureFlag, setDevFlagOverride } from '@/lib/featureFlags'
import { navigationRef } from '@/features/contacts/lib/linking'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesDiagnostics } from '@/features/buddies/stores/buddiesDiagnostics'
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import { checkBuddiesRelay } from '@/features/buddies/lib/buddiesService'
import { checkCryptoVectors } from '@/features/buddies/lib/testing/cryptoVectors'
import apis from '@/constants/apis'
import { SCENARIO_NAMES } from '@/app/dev-harness/scenarios'
import { seedScenario } from '@/app/dev-harness/seedScenario'
import { mmkvStorage } from '@/stores/mmkv'
import { iCloudSync } from '@/app/sync/iCloudSync'
import {
  badgeHarnessState,
  earnEveryBadge,
  earnRandomBadges,
  evaluateBadgesNow,
  offerBadge,
  recentUserAction,
  resetBadgeState,
  showBadgeHistorySummary,
  simulateBuddyBadge,
  simulateBuddyReaction,
} from '@/app/dev-harness/badges'
import { useBadgeSession } from '@/stores/badgeSession'
import { takeoverSnapshot, useTakeover } from '@/stores/takeover'
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

/**
 * The fake Google Drive this dev build syncs with, if any (see
 * `scripts/verify/fake-google-drive-server.mjs`). Persisted so it applies from
 * launch, before sync first runs, and kept across seeds.
 */
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

/**
 * Console.error noise that isn't an app failure. Keep each entry justified;
 * fatal and uncaught errors are never filtered.
 */
const BENIGN_CONSOLE_ERRORS = [
  // Fabric logs this when a keyboard-aware scroll measures an unmounted view.
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
    // false at the app's root, where Android back would leave the app
    canGoBack: navigationRef.isReady() && navigationRef.canGoBack(),
    errors: errors.length,
    apiBase: new URL(apis.notesImportHealth).origin,
  }
}

function seed(name: string) {
  const fakeDrive = mmkvStorage.getString(FAKE_GOOGLE_DRIVE_KEY)
  seedScenario(name)
  if (fakeDrive) mmkvStorage.set(FAKE_GOOGLE_DRIVE_KEY, fakeDrive)
  return summary()
}

/**
 * Dev builds only. Exposes `globalThis.__WW_DEV__` so verification scripts can
 * seed state, flip flags, navigate, and read state back over Hermes CDP
 * (`scripts/verify/ww-verify.mjs eval`). See the verify-witnesswork skill.
 */
export function installDevHarness() {
  if (!__DEV__) return
  captureErrors()
  restoreFakeGoogleDrive()
  const harness = {
    version: 1,
    scenarios: SCENARIO_NAMES,
    seed,
    reset: () => seed('fresh'),
    state: summary,
    /** Launch milestones and work counters since launch (src/lib/perf). */
    perf: () => perf.snapshot(),
    errors: () => [...errors],
    clearErrors: () => {
      errors.length = 0
    },
    // LogBox banners cover the tab bar; errors stay captured above and
    // warnings stay in the Metro log.
    quietLogBox: (quiet = true) => {
      LogBox.ignoreAllLogs(quiet)
      return quiet
    },
    setFlag: (flag: FeatureFlag, value: boolean | string | undefined) => {
      setDevFlagOverride(flag, value)
      return value
    },
    /**
     * Starts the Buddies relay check; read the report afterwards from
     * `stores.buddiesDiagnostics.getState().relayCheck` (eval doesn't await).
     */
    checkBuddiesRelay: () => {
      void checkBuddiesRelay()
      return 'started'
    },
    /**
     * Runs the Buddies known-answer crypto vectors in this runtime (Hermes on
     * iOS or Android); `{ ok, checked, mismatches }`.
     */
    checkBuddiesCryptoVectors: () => checkCryptoVectors(),
    /**
     * Android: sync with a local fake Google Drive instead of Google, as the
     * account `account` (null switches back to real Google).
     */
    fakeGoogleDrive: applyFakeGoogleDrive,
    /**
     * Builds the APNs payload the relay would send this device for an inbox
     * event (`{ seq?, inline? }`); read it a moment later with
     * `buddiesPushPayload()` and replay it with `xcrun simctl push`.
     */
    prepareBuddiesPush,
    buddiesPushPayload: preparedBuddiesPush,
    /** This device's push token; `devicePushToken()` a moment later. */
    prepareDevicePushToken,
    devicePushToken,
    /** The sync engine, for reading state back; drive changes through the UI. */
    sync: iCloudSync,
    setSupporter: (on: boolean) => {
      usePreferences
        .getState()
        .set({ devSupporterOverride: on ? new Date() : null })
      return on
    },
    /**
     * Marks an action the User took, as Add Time's save does (ADR 0021): for
     * the next 15 s, a badge or streak milestone it brings can celebrate full
     * screen. Without it, they arrive quietly (the Home card, the chip flare).
     */
    noteUserAction: (kind: UserActionKind = 'dev') => noteUserAction(kind),
    /**
     * The takeover arbiter: `state()` shows what's on screen, waiting, and
     * holding; `store` is the live zustand store.
     */
    takeover: {
      state: () => takeoverSnapshot(),
      store: useTakeover,
    },
    /**
     * Badge controls (see `dev-harness/badges.ts`). `evaluate()` evaluates as
     * after a change: live badges celebrate only within 15 s of
     * `noteUserAction()`, and wait on the Home card otherwise; `evaluate(true)`
     * files everything quietly. `celebrate(key)` follows the same rule.
     */
    badges: {
      evaluate: (quiet = false) =>
        evaluateBadgesNow({ quiet, action: recentUserAction() }),
      celebrate: offerBadge,
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
      /** A buddy's reaction to one of my badges (`yearRound.2`, `party`). */
      simulateBuddyReaction: (badgeKey?: string, emoji?: string) =>
        simulateBuddyReaction(badgeKey, emoji),
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
      conversations: useConversations,
      serviceReports: useServiceReport,
      mileage: useMileage,
      categories: useCategories,
      buddies: useBuddies,
      buddiesDiagnostics: useBuddiesDiagnostics,
      // The bell's book (`seen`, `dismissed`) and its counted `unread`.
      notificationsTray: useNotificationsTray,
      // `setState({ celebrating: { count, kind } })` replays a milestone; with
      // no action behind it, it waits for its takeover turn without expiring.
      streakCelebration: useStreakCelebration,
      calendarSync: useCalendarSync,
      calendarPublishing: useCalendarPublishing,
      badgeSession: useBadgeSession,
      takeover: useTakeover,
    },
  }
  ;(globalThis as { __WW_DEV__?: typeof harness }).__WW_DEV__ = harness
}
