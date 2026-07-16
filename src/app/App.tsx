import '../../env'
import '@/lib/locales'
import 'react-native-gesture-handler'
import React, { useEffect, useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import RootStackComponent from '@/app/navigation/RootStack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import * as Sentry from '@sentry/react-native'
import * as Updates from 'expo-updates'
import Constants from 'expo-constants'
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import { Kalam_400Regular, Kalam_700Bold } from '@expo-google-fonts/kalam'
// CJK handwriting faces (Gaegu/Klee One/Ma Shan Zheng) are ~26MB combined and
// only used in the Service Report view for ko/ja/zh users. They are downloaded
// on demand instead of bundled — see features/service-reports/lib/handwritingFont.
import {
  ActivityIndicator,
  AppState,
  LogBox,
  Platform,
  useColorScheme,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { TamaguiProvider } from 'tamagui'
import tamaguiConfig from '../../tamagui.config'
import ThemeProvider from '@/providers/ThemeProvider'
import CustomerProvider from '@/providers/CustomerProvider'
import AccountProvider from '@/providers/AccountProvider'
import { ToastProvider, ToastViewport } from '@tamagui/toast'
import {
  hasMigratedFromAsyncStorage,
  migrateFromAsyncStorage,
} from '@/stores/mmkv'
import { usePreferences } from '@/stores/preferences'
import {
  applyAppIcon,
  determineHemisphere,
  resolvePluginIcon,
} from '@/features/settings/lib/appIcon'
import useContacts from '@/stores/contactsStore'
import useCategories from '@/stores/categories'
import useServiceReport from '@/stores/serviceReport'
import { useProfile } from '@/stores/profile'
import { extractProfileFromPreferences } from '@/lib/profileMigration'
import { migrateCustomFieldsToIds } from '@/features/contacts/lib/customFieldsMigration'
import { migrateLdcToCategory, migrateTagsToCategories } from '@/lib/categories'
import AnimationViewProvider from '@/providers/AnimationViewProvider'
import ConfettiProvider from '@/providers/ConfettiProvider'
import useUserLocalePrefs from '@/features/settings/hooks/useLocale'
import { installWidgetSync } from '@/app/widgets/widgetSync'
import { installiCloudSync, iCloudSync } from '@/app/sync/iCloudSync'
import { linking, navigationRef } from '@/features/contacts/lib/linking'
import { setDevRemountListener } from '@/lib/devRemount'
import DeepLinkListeners from '@/app/deep-links/DeepLinkListeners'
import useIsSupporter from '@/hooks/useIsSupporter'
import useCustomer from '@/hooks/useCustomer'
import { useSupporter } from '@/features/supporter/stores/supporter'
import { isOfflineError } from '@/lib/offlineError'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/**
 * Non-urgent. Warning comes from tamagui bug.
 *
 * Check back sometime in the future to see if still exists.
 *
 * Repro: Go to home screen => click contact => + => close tamagui sheet => go
 * back to home => WARN
 */
LogBox.ignoreLogs([
  'Sending `onAnimatedValueUpdate` with no listeners registered.',
])

Sentry.init({
  dsn: 'https://f9600209459a43d18c3d2c3a6ac2aa7b@o572512.ingest.sentry.io/4505271593074688',
  enabled: !__DEV__,
  debug: __DEV__,
  attachScreenshot: true,
  // Drop expected "device is offline" errors. RevenueCat / RN native modules
  // reject with these when the user has no connection; they are not bugs and a
  // single offline user retrying can generate hundreds of duplicate events
  // (JW-TIME-5B, JW-TIME-BW). Returning null discards the event.
  beforeSend: (event, hint) =>
    isOfflineError(hint?.originalException) ? null : event,
})

Sentry.setTag('deviceId', Constants.sessionId)
Sentry.setTag('appOwnership', Constants.appOwnership || 'N/A')
if (Constants.appOwnership === 'expo' && Constants.expoVersion) {
  Sentry.setTag('expoAppVersion', Constants.expoVersion)
}
Sentry.setTag('expoChannel', Updates.channel)
Sentry.setTag('expoUpdateVersion', Updates.updateId)

/**
 * Mirrors supporter status into the `useSupporter` zustand store so non-React
 * code (widget snapshot writer) can branch on it without pulling from
 * `CustomerContext`. Kept tiny and side-effect-only so it composes cleanly
 * alongside `SupporterSyncDefault`.
 */
function SupporterStoreSync() {
  const { isSupporter } = useIsSupporter()
  useEffect(() => {
    useSupporter.getState().setSupporter(isSupporter)
  }, [isSupporter])
  return null
}

/**
 * Auto-enables iCloud sync for supporters who haven't explicitly chosen a
 * setting yet. Runs inside CustomerProvider so useIsSupporter is available.
 * Once the user touches the toggle in Settings, `iCloudSyncSetByUser` is set
 * and this effect becomes a permanent no-op.
 *
 * Delegates to `resolveInitialEnable()` + `apply*Enable()` so auto-enable
 * shares the same look-before-leaping decision as the manual Settings toggle.
 * Critically, the `conflict` outcome (remote data exists AND local has
 * meaningful user records) leaves sync **disabled** — a headless auto-enable
 * can't safely pick between keep-local / use-remote / merge, and silently
 * defaulting to any of them can clobber data. Users land in Settings and
 * resolve explicitly via `FirstEnableSheet`.
 */
/**
 * Applies the user's selected supporter-only app icon when supporter status
 * resolves and on AppState→active transitions. Two reasons to re-run on
 * foreground:
 *
 * 1. Seasonal: the persisted `customAppIcon` is `'Seasonal'` regardless of which
 *    season's art is active; we have to recompute which `SeasonalXxx` plugin
 *    name to apply on every wake-up so the tile rotates at season boundaries
 *    (worst case: lag of one app open).
 * 2. Lapse: if RevenueCat has flipped the user out of supporter status while the
 *    app was backgrounded, we revert the Home Screen tile to default
 *    immediately on the next foreground rather than waiting for an explicit
 *    user action. Mirrors `customAccentColor`'s "applies only while supporter
 *    status is active" semantics.
 *
 * Critically, this gates on `customer !== null` — until RevenueCat's initial
 * `getCustomerInfo()` resolves, `isSupporter` defaults to `false` for one
 * render. Acting on that false pulse would revert a legitimately-active
 * alternate icon to the default and fire a "App Icon Updated" system
 * notification, only to fire a second one a moment later when supporter status
 * loads and we re-apply the user's choice. By waiting for the customer to load,
 * we either confirm the icon should stay (idempotent skip) or we confirm a true
 * lapse and revert exactly once.
 *
 * The applier is also idempotent — `applyAppIcon` no-ops when the requested
 * icon is already active — so the stable-supporter path on launch is silent.
 */
function AppIconSync() {
  const { customer } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const { customAppIcon } = usePreferences()
  const supporterStatusKnown = customer !== null

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    if (!supporterStatusKnown) return

    let cancelled = false
    const apply = async () => {
      const target =
        isSupporter && customAppIcon
          ? resolvePluginIcon(customAppIcon, await determineHemisphere())
          : null
      if (cancelled) return
      try {
        await applyAppIcon(target)
      } catch {
        // The system "App Icon Updated" alert is the user-visible failure
        // mode anyway; swallow so a transient glitch doesn't crash boot.
      }
    }

    void apply()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void apply()
    })
    return () => {
      cancelled = true
      sub.remove()
    }
  }, [supporterStatusKnown, isSupporter, customAppIcon])

  return null
}

/**
 * Reactively disables iCloud sync the moment supporter status lapses, mirroring
 * how `AppIconSync` reverts the Home Screen tile and how `customAccentColor` is
 * gated in widget snapshots. Without this, a lapsed supporter's data would keep
 * round-tripping through iCloud even though every other supporter feature has
 * gone dark.
 *
 * Gates on `customer !== null` for the same reason as `AppIconSync`: until
 * RevenueCat's initial `getCustomerInfo()` resolves, `isSupporter` is a
 * transient `false`, and acting on it would clobber a legitimately-enabled sync
 * setting on every app launch.
 *
 * Resets `iCloudSyncSetByUser` so a future re-subscription re-enters the
 * auto-enable flow in `SupporterSyncDefault` (same first-enable look-before-
 * leaping decision as a brand new supporter), rather than leaving sync
 * permanently off.
 */
function SupporterSyncLapseGate() {
  const { customer } = useCustomer()
  const { isSupporter } = useIsSupporter()
  const { iCloudSyncEnabled, set } = usePreferences()
  const supporterStatusKnown = customer !== null

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    if (!supporterStatusKnown) return
    if (isSupporter) return
    if (!iCloudSyncEnabled) return
    set({ iCloudSyncEnabled: false, iCloudSyncSetByUser: false })
  }, [supporterStatusKnown, isSupporter, iCloudSyncEnabled, set])

  return null
}

function SupporterSyncDefault() {
  const { isSupporter } = useIsSupporter()
  const { iCloudSyncEnabled, iCloudSyncSetByUser } = usePreferences()

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    if (!isSupporter) return
    if (iCloudSyncSetByUser) return
    if (iCloudSyncEnabled) return

    let cancelled = false
    void (async () => {
      const decision = await iCloudSync.resolveInitialEnable()
      if (cancelled) return
      switch (decision.outcome) {
        case 'seed':
          await iCloudSync.applySeedEnable()
          return
        case 'pull':
          iCloudSync.applyPullEnable(decision.remote)
          return
        case 'conflict':
        case 'unavailable':
          return
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isSupporter, iCloudSyncSetByUser, iCloudSyncEnabled])

  return null
}

export default function App() {
  const systemColorScheme = useColorScheme()
  const { colorScheme } = usePreferences()
  useUserLocalePrefs()

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
    Kalam_400Regular,
    Kalam_700Bold,
  })
  const [hasMigrated, setHasMigrated] = useState(hasMigratedFromAsyncStorage())

  // Dev-only: bumping this key remounts the whole navigation tree (every
  // screen back to initial state) without a Metro bundle reload, so an
  // attached profiler session survives. Triggered via triggerDevRemount().
  const [devRemountKey, setDevRemountKey] = useState(0)
  useEffect(() => {
    if (!__DEV__) return
    setDevRemountListener(() => setDevRemountKey((k) => k + 1))
    return () => setDevRemountListener(null)
  }, [])

  // A focused native-stack screen does not receive another navigation-focus
  // event when iOS backgrounds and foregrounds the app. Normalize Scribe's
  // persisted allowance on every AppState→active transition so a window that
  // expired in the background immediately re-arms stale limit-denied imports.
  useEffect(() => {
    const activate = () => useNotesImportManager.getState().appBecameActive()
    activate()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') activate()
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!hasMigratedFromAsyncStorage()) {
      // Deferred to idle so the migration doesn't jank the launch animation
      // (InteractionManager is deprecated as of RN 0.86).
      requestIdleCallback(async () => {
        try {
          await migrateFromAsyncStorage()
          await Updates.reloadAsync() // Reloads JS and causes stores to point to new MMKV store
        } catch {
          // Falls back to async storage
        }
        setHasMigrated(true) // Allows app to continue regardless
      })
    }
  }, [])

  // Migrate legacy `preferences.customContactFields: string[]` into id-keyed
  // `contactsStore.customFieldDefs`. Runs once per install after MMKV is
  // ready, gated by `hasMigratedCustomFieldsToIds`. See
  // `lib/customFieldsMigration.ts` for the full transform.
  useEffect(() => {
    if (!hasMigrated) return
    const prefs = usePreferences.getState()
    if (prefs.hasMigratedCustomFieldsToIds) return

    // The legacy field was removed from the type; read it from the persisted
    // state where it may still live as an unknown key.
    const legacyLabels = ((
      prefs as unknown as { customContactFields?: string[] }
    ).customContactFields ?? []) as string[]

    const contactsState = useContacts.getState()
    const result = migrateCustomFieldsToIds({
      legacyLabels,
      contacts: contactsState.contacts,
      deletedContacts: contactsState.deletedContacts,
      now: Date.now(),
    })

    useContacts.setState({
      contacts: result.contacts,
      deletedContacts: result.deletedContacts,
      customFieldDefs: result.defs,
    })

    // Use raw setState to bypass the syncing wrapper — we don't want the
    // legacy-field cleanup to stamp `preferenceUpdatedAt`. The migration
    // flag is in NON_SYNCABLE so it would already be skipped, but keeping
    // both writes raw makes intent explicit.
    usePreferences.setState({
      hasMigratedCustomFieldsToIds: true,
      // Drop the legacy field from in-memory state so it stops appearing in
      // future persist writes (JSON.stringify drops undefined values).
      ...({ customContactFields: undefined } as Record<string, unknown>),
    } as never)
  }, [hasMigrated])

  // Promote the legacy `tag` field + `preferences.serviceReportTags` list into
  // first-class `Category` records (see `src/lib/categories.ts`). Runs once
  // per install after MMKV is ready, gated on `hasMigratedTagsToCategories`.
  // Idempotent at the runner level: if the flag is false and there is nothing
  // to migrate, it just flips the flag and exits. Cross-device iCloud pulls
  // that re-introduce a tagged entry are absorbed by the next migration pass
  // when the flag is re-armed via manual user action — for v1 we accept that
  // the flag is one-shot per install (see CONTEXT.md for the wave-2 plan).
  useEffect(() => {
    if (!hasMigrated) return
    const prefs = usePreferences.getState()
    if (prefs.hasMigratedTagsToCategories) return

    const reports = useServiceReport.getState()
    const legacyTags = ((
      prefs as unknown as {
        serviceReportTags?: (string | { value: string; credit?: boolean })[]
      }
    ).serviceReportTags ?? []) as (
      | string
      | { value: string; credit?: boolean }
    )[]

    const result = migrateTagsToCategories({
      serviceReports: reports.serviceReports,
      legacyTags,
      now: Date.now(),
    })

    // Seed the new Categories store. Use raw setState to skip the per-store
    // stamping (we set updatedAt explicitly inside the migration result).
    useCategories.setState({
      categories: result.categories,
      deletedCategories: [],
    })

    // Apply the rewritten ServiceReports (categoryId + reconciled credit).
    // Raw setState bypasses the per-store `updatedAt` re-stamp — the
    // migration intentionally preserves each entry's existing `updatedAt`.
    if (result.categories.length > 0) {
      reports.set({ serviceReports: result.serviceReports })
    }

    // Drop the legacy preferences.serviceReportTags field from in-memory state
    // so it stops appearing in future persist writes (JSON.stringify drops
    // undefined). Use raw setState to bypass the syncing wrapper.
    usePreferences.setState({
      hasMigratedTagsToCategories: true,
      ...({ serviceReportTags: undefined } as Record<string, unknown>),
    } as never)
  }, [hasMigrated])

  // Split the identity-shaped fields out of the legacy preferences blob into
  // the new Profile store (`@/stores/profile`). Runs once per install after
  // MMKV is ready, gated on `hasMigratedProfileFromPreferences`. The
  // preferences persist `migrate` callback at v2 → v3 is intentionally a
  // no-op for this split (it can only return its own blob); this runner is
  // the single source of truth for both the seeding AND the cleanup. See
  // `src/lib/profileMigration.ts` for the pure transform.
  //
  // Wave-3 of the store-narrowing series (after customFieldsMigration and
  // tagsToCategories). Mirrors that pattern: the runner reads legacy fields
  // from the rehydrated preferences state via a cast (the keys are no longer
  // in PREFERENCE_DEFAULTS, so combine() doesn't fill defaults for them and
  // the persisted v2 values pass through untouched).
  useEffect(() => {
    if (!hasMigrated) return
    const prefs = usePreferences.getState()
    if (prefs.hasMigratedProfileFromPreferences) return

    // Cast through unknown — the moved keys are gone from the typed state, but
    // a v2 persisted blob still carries them in raw rehydrated form until we
    // drop them below.
    const legacyPrefs = prefs as unknown as Record<string, unknown>
    const result = extractProfileFromPreferences(legacyPrefs)

    // Seed the new Profile store with the extracted values + their existing
    // updatedAt timestamps. Raw setState bypasses the stamping wrapper so we
    // don't bump `profileUpdatedAt` to `Date.now()` on first-launch upgrade —
    // we want LWW to reflect when the user last changed each field.
    if (Object.keys(result.profile.values).length > 0) {
      useProfile.setState({
        ...result.profile.values,
        profileUpdatedAt: result.profile.updatedAt,
      } as never)
    }

    // Drop the legacy fields from preferences + flip the flag. `undefined`
    // values are omitted by `JSON.stringify`, so the next persist write
    // produces a v3-shaped blob with no profile-shaped keys.
    usePreferences.setState({
      hasMigratedProfileFromPreferences: true,
      ...({
        name: undefined,
        avatar: undefined,
        customAvatarBackground: undefined,
        hasCompletedProfileSetup: undefined,
      } as Record<string, unknown>),
    } as never)

    // Also drop the moved keys from `preferenceUpdatedAt` so settings-side
    // LWW stops tracking them. Done as a second raw setState so we can pull
    // the latest map (it may have been mutated by the seeding step above).
    const latest = usePreferences.getState()
    if (
      latest.preferenceUpdatedAt &&
      typeof latest.preferenceUpdatedAt === 'object'
    ) {
      const cleaned: Record<string, number> = {}
      for (const [key, ts] of Object.entries(latest.preferenceUpdatedAt)) {
        if (
          key === 'name' ||
          key === 'avatar' ||
          key === 'customAvatarBackground' ||
          key === 'hasCompletedProfileSetup'
        ) {
          continue
        }
        cleaned[key] = ts
      }
      usePreferences.setState({ preferenceUpdatedAt: cleaned })
    }
  }, [hasMigrated])

  // Collapse the legacy `TimeEntry.ldc` boolean into the LDC builtin
  // Category (see `migrateLdcToCategory` in `src/lib/categories.ts`). Runs
  // once per install after MMKV is ready, gated on
  // `hasCollapsedLdcIntoCategory`. Must run AFTER the tag → Category
  // migration so the categories list is fully populated before LDC is folded
  // in. The dependency on `hasMigratedTagsToCategories` is implicit: both
  // runners gate on `hasMigrated` and write through raw setState, so by the
  // time this effect fires the tag-migration useEffect has already flipped
  // `hasMigratedTagsToCategories: true` synchronously in the same render
  // tick.
  useEffect(() => {
    if (!hasMigrated) return
    const prefs = usePreferences.getState()
    if (prefs.hasCollapsedLdcIntoCategory) return

    const reports = useServiceReport.getState()
    const cats = useCategories.getState()

    const result = migrateLdcToCategory({
      serviceReports: reports.serviceReports,
      categories: cats.categories,
      now: Date.now(),
    })

    // Seed the LDC builtin Category record if it wasn't already present.
    // Raw setState avoids re-stamping `updatedAt` on every existing record —
    // `migrateLdcToCategory` stamps only the newly-seeded builtin.
    if (result.seededLdcBuiltin) {
      useCategories.setState({ categories: result.categories })
    }

    // Apply rewritten ServiceReports (categoryId + credit on former LDC
    // entries; `ldc` stripped). Raw setState skips the per-store updatedAt
    // re-stamp so existing entries keep their last-edit timestamp.
    if (result.rewrittenCount > 0 || result.conflictedCount > 0) {
      reports.set({ serviceReports: result.serviceReports })
    }

    usePreferences.setState({
      hasCollapsedLdcIntoCategory: true,
    } as never)
  }, [hasMigrated])

  // Normalize the legacy `'es-mx'` locale to `'es-es'` after the es-MX bundle
  // was retired. Idempotent — checked on every launch so an iCloud pull that
  // re-introduces the stale value also gets cleaned up. Uses raw `setState`
  // to avoid bumping `preferenceUpdatedAt.locale`, so a genuine user locale
  // choice on another device still wins the LWW merge.
  useEffect(() => {
    if (!hasMigrated) return
    const legacyLocale = (
      usePreferences.getState() as unknown as { locale?: string }
    ).locale
    if (legacyLocale !== 'es-mx') return
    usePreferences.setState({ locale: 'es-es' })
  }, [hasMigrated])

  // Install iOS widget snapshot sync after MMKV is the source of truth.
  // No-op before the native module is linked (pre-prebuild).
  useEffect(() => {
    if (!hasMigrated) return
    const teardown = installWidgetSync()
    return teardown
  }, [hasMigrated])

  // Install the iCloud sync layer after storage is settled. Gated internally
  // on iOS + supporter opt-in (preferences.iCloudSyncEnabled), so this is a
  // no-op for users who haven't turned it on or don't have the native module
  // linked.
  useEffect(() => {
    if (!hasMigrated) return
    const teardown = installiCloudSync()
    return teardown
  }, [hasMigrated])

  if (!hasMigrated) {
    return (
      <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        {/* show loading indicator while app is migrating storage... */}
        <ActivityIndicator />
      </View>
    )
  }

  if (!fontsLoaded) {
    return null
  }

  try {
    return (
      <CustomerProvider>
        <AccountProvider>
          <SupporterStoreSync />
          <SupporterSyncDefault />
          <SupporterSyncLapseGate />
          <AppIconSync />
          <ThemeProvider>
            <SafeAreaProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <NavigationContainer
                  key={devRemountKey}
                  ref={navigationRef}
                  linking={linking}
                >
                  {/*
                   * ToastProvider must wrap TamaguiProvider — TamaguiProvider
                   * mounts its own PortalProvider internally, and tamagui Sheets
                   * (with `modal`) render their content via that portal host.
                   * If ToastProvider sat inside TamaguiProvider, portaled sheet
                   * content would render outside the toast context and
                   * useToastController() would return an empty default, so
                   * toast.show inside a Sheet (e.g. SelectedDateSheet on the
                   * Progress screen) would throw "show is not a function".
                   * ToastViewport stays inside TamaguiProvider since it's a
                   * styled component that needs the Tamagui theme.
                   */}
                  <ToastProvider>
                    <TamaguiProvider
                      defaultTheme={
                        colorScheme
                          ? colorScheme
                          : systemColorScheme || undefined
                      }
                      config={tamaguiConfig}
                    >
                      <StatusBar />
                      <ToastViewport />
                      <ConfettiProvider>
                        <AnimationViewProvider>
                          <DeepLinkListeners />
                          <RootStackComponent />
                        </AnimationViewProvider>
                      </ConfettiProvider>
                    </TamaguiProvider>
                  </ToastProvider>
                </NavigationContainer>
              </GestureHandlerRootView>
            </SafeAreaProvider>
          </ThemeProvider>
        </AccountProvider>
      </CustomerProvider>
    )
  } catch (error) {
    Sentry.captureException(error)
  }
}
