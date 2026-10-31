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
import { revenueCatHarness } from '@/app/dev-harness/revenueCat'
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

type OpenAlert = { title: string; buttons: string[]; cancel?: string }

/** Alerts on screen now, newest last (`Alert.alert` is native, out of reach). */
const openAlerts: OpenAlert[] = []

/**
 * Notes each `Alert.alert` until one of its buttons (or Android's tap outside)
 * closes it, so the harness knows which button to press to clear the screen:
 * agent-device's own alert query times out over a busy iOS screen.
 */
function trackAlerts() {
  const show = Alert.alert
  Alert.alert = (title, message, buttons, options) => {
    // With no buttons the system shows a lone OK, which reports nothing back;
    // the entry then stays until the harness forgets it.
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
          // A prompt passes its text; an alert passes nothing.
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

/**
 * The navigation container a `remount()` replaces; the new one is ready once
 * `navigationRef` points elsewhere and its first screen is up.
 */
let remountedFrom: unknown

function remount() {
  // The remount lands on Home already; a seed's later move there would undo
  // a screen opened right after it.
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
    // The root stack's screens, bottom first, to catch a screen pushed twice.
    stack: navigationRef.isReady()
      ? (navigationRef.getRootState()?.routes.map((r) => r.name) ?? [])
      : [],
    // false at the app's root, where Android back would leave the app
    canGoBack: navigationRef.isReady() && navigationRef.canGoBack(),
    // false until the screens a `remount()` asked for have mounted
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
  // A flow that stopped while the app was gated leaves the next one a clean app.
  appUpdateHarness.clear()
  useUpdateRequired.setState({ required: null })
  usePendingUpdate.setState({ bundleId: null })
  if (fakeDrive) mmkvStorage.set(FAKE_GOOGLE_DRIVE_KEY, fakeDrive)
  // A seed keeps the layout direction it found (Tools → Force Right to Left).
  if (forceRtl) setDevForceRtl(true)
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
  trackAlerts()
  restoreFakeGoogleDrive()
  const harness = {
    version: 1,
    scenarios: SCENARIO_NAMES,
    seed,
    reset: () => seed('fresh'),
    state: summary,
    /**
     * Alerts still on screen (`{ title, buttons, cancel }`); `wwv flow` presses
     * one of their buttons before each flow.
     */
    alerts: () => [...openAlerts],
    /** Forgets alerts the harness pressed away. */
    forgetAlerts: () => {
      openAlerts.length = 0
      return true
    },
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
    /** A flag's JSON payload, as PostHog would send it; undefined to clear. */
    setFlagPayload: (flag: FeatureFlag, payload: JsonType | undefined) => {
      setDevFlagPayloadOverride(flag, payload)
      return payload
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
     * The Buddies engine, to pair two devices and sync without tapping through
     * Buddies: `createInvite()` here, `acceptInvite(link)` on the other device,
     * then `confirmClaim(inviteId)` here. Calls return promises (eval doesn't
     * await), so read the store back afterwards.
     */
    buddiesEngine,
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
    /**
     * The route builder's San Francisco stops (Tools → Generate today's route)
     * on the day `daysFromToday` away; re-running a day changes nothing.
     */
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
    /**
     * A tidy demo day for the route builder (one neighborhood, a meeting for
     * field service, five Follow-ups) `daysFromToday` away.
     */
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
    /**
     * Marks an action the User took, as Add Time's save does (ADR 0021): for
     * the next 15 s, a badge or pet item it brings shows an unlock toast and a
     * streak milestone celebrates full screen. Without it, they arrive quietly
     * (the notifications tray, the chip flare).
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
     * after a change: live badges show unlock toasts only within 15 s of
     * `noteUserAction()`, and wait in the tray otherwise; `evaluate(true)`
     * files everything quietly. `celebrate(key)` follows the same rule;
     * `moment(key)` opens a badge's full-screen celebration directly.
     */
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
      /** A buddy's reaction to one of my badges (`yearRound.2`, `party`). */
      simulateBuddyReaction: (badgeKey?: string, emoji?: string) =>
        simulateBuddyReaction(badgeKey, emoji),
    },
    /**
     * The account key and server account: `account.read()`, then
     * `account.last`; `account.randomRecoveryKey()` for a valid key to enter.
     */
    account: accountHarness,
    /**
     * Set Up Another Device: `handoff.state()` (role, step, status, code, the
     * request log), `handoff.link()` (the QR link while one shows), and
     * `handoff.selfTest()` then `handoff.selfTestResult`.
     */
    handoff: handoffHarness,
    /**
     * The account backup: `backup.state()`; `enable()`, `uploadNow()`,
     * `list()`, `inspect()` (decrypted slots as counts), `dryRun()`,
     * `offerRestore()`, `deleteAll()`, then `backup.last`.
     */
    backup: backupHarness,
    /**
     * Locked backup files: `backupFile.bench()` (Argon2id's time here),
     * `lock('account' | 'password', password)`, `unlock(password)`,
     * `save(kind)` or `share(kind)` (`locked`, `plain`, `otherAccount`), then
     * `backupFile.last`.
     */
    backupFile: backupFileHarness,
    /**
     * Cloud Sync (ADR 0030): `cloudSync.state()`; `checkConfig()`, `refresh()`,
     * `prepare()`, `list()` (the account's slots), `switchTo('cloud' |
     * 'platform' | 'off')`, `syncNow()`, then `cloudSync.last`.
     * `simulateUpgradedPlatformDevice()` and `forgetChoice()` set up the
     * default and the one-time offer.
     */
    cloudSync: cloudSyncHarness,
    /**
     * One RevenueCat customer per account (ADR 0040 §7): `revenueCat.state()`
     * (this device's id, claims and the server's Supporter answer, ids as
     * fingerprints); `readRevenueCat()` and `refreshServer()`, then
     * `revenueCat.last`.
     */
    revenueCat: revenueCatHarness,
    /**
     * Update Required through this device's own answers (see
     * `dev-harness/appUpdate.ts`): `minAppVersion('99.0.0')` gates from the
     * config and `minAppVersion(null)` lifts it; `upgradeRequired(path)`
     * answers 426 to matching ww-api requests; `requests()` lists what was sent
     * since; `clear()`.
     */
    appUpdate: appUpdateHarness,
    /**
     * The Pet Companion (see `dev-harness/pet.ts`): `adopt(species, coat?,
     * name?)`, `setAppearance`, `setRoom`, `release()`, `override({ hearts,
     * dead, gold, … })` / `clearOverride()`, `play('entrance' | 'trick' |
     * 'twirl' | 'wake' | 'cheer')`, `pat(n)`, `scrub(ms)` and `state()`.
     */
    pet: petHarness,
    /**
     * Scribe AI (see `dev-harness/scribe.ts`): `enableFake()` answers on the
     * device; `script(name)` queues a canned turn (`scripts`), `send(text)` or
     * `injectProposal()` runs it; `latest()`, `conversation(id)`,
     * `proposal(id)`, `add`/`dismiss`/`toggle`/`choose`/`undo`, `state()`,
     * `availability()`, `setFakeUsage({ limited })`, `setGate({ … })`,
     * `contextSize()`, `requests()` and `clear()`.
     */
    scribe: scribeHarness,
    /**
     * Connectivity as the app reads it: `offline(true)` reads as offline
     * whatever the simulator says, `offline(false)` comes back (reconnect
     * listeners run). Returns the state the app reads now.
     */
    network: {
      offline: (on = true) => simulateOffline(on),
      state: getOnline,
    },
    /**
     * The Tools "Force Right to Left" switch, without the reload: relaunch
     * (`wwv up`) to apply it. Returns the direction the app runs in now.
     */
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
    /**
     * What UIKit reports for the window on iPhone Duo: the fold (`divisions`,
     * `active` while partly folded), the vertical bar edge and the size class.
     * Null on devices that never report.
     */
    displayRegions: () => useDisplayRegions.getState().regions,
    /**
     * A string in the app Language, as the app renders it (`t('hoursShort', {
     * count: 2 })`).
     */
    t: (key: string, options?: Record<string, unknown>) =>
      i18n.t(key as TranslationKey, options),
    /**
     * Relaunches as if before the device's first unlock: only the splash, with
     * stores reading and writing nothing, until the app comes back from the
     * background. `storageLocked()` reads the guard.
     */
    simulateLockedLaunch: () => {
      simulateLockedLaunch()
      void reloadApp()
      return true
    },
    storageLocked: isStorageLocked,
    /**
     * Whether the open note editor's web view has loaded; typing before that
     * goes nowhere (its page builds slowly on a fresh Metro).
     */
    noteEditorLoaded: isNoteEditorLoaded,
    /** Every screen mounts fresh, as on a cold launch, on Home. */
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
      // Contacts whose address lookup failed on save, waiting to retry.
      geocodeRetry: useGeocodeRetry,
      // Address keys the Map's Find contacts row no longer offers.
      mapFindSkips: useMapFindSkips,
      // The Help Center bundle on screen (`locale`, `source`, `bundle.hash`).
      helpCenter: useHelpCenterStore,
      conversations: useConversations,
      serviceReports: useServiceReport,
      mileage: useMileage,
      // Route builder routes by day (`routes['YYYY-MM-DD']`), device-local.
      savedRoutes: useSavedRoutes,
      savedPlaces: useSavedPlaces,
      // The companion and room records (`pet`, `room`) and their tombstones.
      pet: usePet,
      // The reward stack playing now (`run`: `slot`, `phase`, `lines`,
      // `played`, `shown`), or null.
      rewardStack: useRewardStack,
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
      // `open`, and `away` while a badge view opened from it is up.
      profileOverlay: useProfileOverlay,
      splitSheet: useSplitSheetPreferences,
      // `enabled`/`requireAfter`, and the session's `locked`.
      appLock: useAppLockSettings,
      // `setState({ required: { source: 'server', currentVersion, minVersion:
      // null } })` shows Update Required without a floor on the shared API.
      updateRequired: useUpdateRequired,
      appLockSession: useAppLockSession,
      // `getState().request('dev')` plays the update reveal and its tour.
      updateReveal: useUpdateRevealStore,
      // `setState({ bundleId: 'verify-bundle' })` lists a downloaded OTA update
      // in the tray, as the launch check does in a release build; Update Now
      // reloads the JS bundle here.
      pendingUpdate: usePendingUpdate,
      // `getState().request()` replays The Milestone Update's grand reveal.
      milestoneReveal: useMilestoneRevealStore,
      // `toast.undo({ title, onUndo })` shows a toast (also `success`, `info`,
      // `error`, `news`); `toasts.getState().toasts` lists those showing.
      toast,
      toasts: useToasts,
    },
  }
  ;(globalThis as { __WW_DEV__?: typeof harness }).__WW_DEV__ = harness
}
