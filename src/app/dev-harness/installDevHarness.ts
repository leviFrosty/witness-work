import moment from 'moment'
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
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import { checkBuddiesRelay } from '@/features/buddies/lib/buddiesService'
import { checkCryptoVectors } from '@/features/buddies/lib/testing/cryptoVectors'
import apis from '@/constants/apis'
import { buildScenario, SCENARIO_NAMES } from '@/app/dev-harness/scenarios'
import { resetLocalData } from '@/app/dev-harness/resetLocalData'
import { mmkvStorage } from '@/stores/mmkv'
import { iCloudSync } from '@/app/sync/iCloudSync'
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
    route: route ? { name: route.name, params: route.params } : null,
    // false at the app's root, where Android back would leave the app
    canGoBack: navigationRef.isReady() && navigationRef.canGoBack(),
    errors: errors.length,
    apiBase: new URL(apis.notesImportHealth).origin,
  }
}

function seed(name: string) {
  const scenario = buildScenario(name, moment())
  const fakeDrive = mmkvStorage.getString(FAKE_GOOGLE_DRIVE_KEY)
  resetLocalData()
  if (fakeDrive) mmkvStorage.set(FAKE_GOOGLE_DRIVE_KEY, fakeDrive)
  const preferences = usePreferences.getState()
  preferences.setRole(scenario.role)
  usePreferences.getState().set({
    onboardingComplete: scenario.onboarded,
    tenureStartDate: scenario.tenureStartDate,
    // Keeps the full-screen rollover prompt from covering a fresh seed.
    lastRolloverYearMonth: moment().format('YYYY-MM'),
    // Same for the Schedule intro; Schedule's header button still opens it.
    scheduleIntroSeen: scenario.onboarded,
  })
  if (scenario.onboarded) {
    useProfile.getState().set({
      name: scenario.profileName,
      hasCompletedProfileSetup: true,
    })
  }
  const { addContact } = useContacts.getState()
  scenario.contacts.forEach(addContact)
  const { addConversation } = useConversations.getState()
  scenario.visits.forEach(addConversation)
  const { addServiceReport, addDayPlan } = useServiceReport.getState()
  scenario.timeEntries.forEach(addServiceReport)
  scenario.dayPlans.forEach(addDayPlan)
  if (scenario.onboarded) {
    // Start from Home, after RootStack swaps Onboarding out for Root.
    setTimeout(() => {
      if (navigationRef.isReady())
        navigationRef.resetRoot({ index: 0, routes: [{ name: 'Root' }] })
    }, 100)
  }
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
    /** The sync engine, for reading state back; drive changes through the UI. */
    sync: iCloudSync,
    setSupporter: (on: boolean) => {
      usePreferences
        .getState()
        .set({ devSupporterOverride: on ? new Date() : null })
      return on
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
      // `setState({ celebrating: { count, kind } })` replays a milestone.
      streakCelebration: useStreakCelebration,
      calendarSync: useCalendarSync,
      calendarPublishing: useCalendarPublishing,
    },
  }
  ;(globalThis as { __WW_DEV__?: typeof harness }).__WW_DEV__ = harness
}
