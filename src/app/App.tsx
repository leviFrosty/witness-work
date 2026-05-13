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
import { Gaegu_400Regular, Gaegu_700Bold } from '@expo-google-fonts/gaegu'
import {
  KleeOne_400Regular,
  KleeOne_600SemiBold,
} from '@expo-google-fonts/klee-one'
import { MaShanZheng_400Regular } from '@expo-google-fonts/ma-shan-zheng'
import {
  ActivityIndicator,
  AppState,
  InteractionManager,
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
import { migrateCustomFieldsToIds } from '@/features/contacts/lib/customFieldsMigration'
import AnimationViewProvider from '@/providers/AnimationViewProvider'
import ConfettiProvider from '@/providers/ConfettiProvider'
import useUserLocalePrefs from '@/features/settings/hooks/useLocale'
import { installWidgetSync } from '@/app/widgets/widgetSync'
import { installiCloudSync, iCloudSync } from '@/app/sync/iCloudSync'
import { linking, navigationRef } from '@/features/contacts/lib/linking'
import DeepLinkListeners from '@/app/deep-links/DeepLinkListeners'
import useIsSupporter from '@/hooks/useIsSupporter'
import useCustomer from '@/hooks/useCustomer'
import { useSupporter } from '@/features/supporter/stores/supporter'

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
    Gaegu_400Regular,
    Gaegu_700Bold,
    KleeOne_400Regular,
    KleeOne_600SemiBold,
    MaShanZheng_400Regular,
  })
  const [hasMigrated, setHasMigrated] = useState(hasMigratedFromAsyncStorage())

  useEffect(() => {
    if (!hasMigratedFromAsyncStorage()) {
      InteractionManager.runAfterInteractions(async () => {
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
        <SupporterStoreSync />
        <SupporterSyncDefault />
        <SupporterSyncLapseGate />
        <AppIconSync />
        <ThemeProvider>
          <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <NavigationContainer ref={navigationRef} linking={linking}>
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
                      colorScheme ? colorScheme : systemColorScheme || undefined
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
      </CustomerProvider>
    )
  } catch (error) {
    Sentry.captureException(error)
  }
}
