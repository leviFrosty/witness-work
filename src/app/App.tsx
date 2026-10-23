import '../../env'
import '@/lib/locales'
import { useLayoutDirectionReload } from '@/app/launch/layoutDirection'
import 'react-native-gesture-handler'
import React, { useRef } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useColorScheme } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useNoteImageCleanup } from '@/app/notes/useNoteImageCleanup'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { TamaguiProvider } from 'tamagui'
import tamaguiConfig from '../../tamagui.config'
import ThemeProvider from '@/providers/ThemeProvider'
import CustomerProvider from '@/providers/CustomerProvider'
import AccountProvider from '@/providers/AccountProvider'
import SurveyProvider from '@/providers/SurveyProvider'
import AnimationViewProvider from '@/providers/AnimationViewProvider'
import ConfettiProvider from '@/providers/ConfettiProvider'
import RootStackComponent from '@/app/navigation/RootStack'
import SystemBars from '@/app/components/SystemBars'
import DisplayRegionsObserver from '@/components/DisplayRegionsObserver'
import LaunchSplash from '@/app/launch/LaunchSplash'
import { useStorageUnlock } from '@/app/launch/useStorageUnlock'
import { markLaunched } from '@/app/launch/launchState'
import { useAfterLaunch } from '@/app/launch/useAfterLaunch'
import { captureLaunchTiming } from '@/app/launch/captureLaunchTiming'
import { perf } from '@/lib/perf'
import { reportLaunch } from '@/lib/perfProbe'
import DeepLinkListeners from '@/app/deep-links/DeepLinkListeners'
import BuddiesRuntime from '@/app/buddies/BuddiesRuntime'
import BadgesRuntime from '@/app/badges/BadgesRuntime'
import '@/app/buddies/buddiesBackgroundSync'
import NotificationResponseListener from '@/app/notifications/NotificationResponseListener'
import SilentForegroundAlerts from '@/app/notifications/SilentForegroundAlerts'
import SystemMenu from '@/app/menu-bar/SystemMenu'
import { ScribeRoot } from '@/features/scribe'
import SupporterStoreSync from '@/features/supporter/components/SupporterStoreSync'
import SupporterSyncDefault from '@/app/sync/components/SupporterSyncDefault'
import CloudSyncDefault from '@/app/sync/components/CloudSyncDefault'
import SupporterSyncLapseGate from '@/app/sync/components/SupporterSyncLapseGate'
import AppIconSync from '@/features/settings/components/AppIconSync'
import { FeatureFlagsRuntime } from '@/lib/featureFlags'
import '@/lib/analyticsConsent'
import { usePreferences } from '@/stores/preferences'
import useUserLocalePrefs from '@/features/settings/hooks/useLocale'
import { useDevRemountKey } from '@/app/navigation/useDevRemountKey'
import { useAppMigrations } from '@/app/migrations/useAppMigrations'
import { useWidgetSync } from '@/app/widgets/useWidgetSync'
import { useWatchSync } from '@/app/watch/useWatchSync'
import { useReconciledReminders } from '@/app/notifications/useReconciledReminders'
import { useLocalAvatarCleanup } from '@/app/sync/useLocalAvatarCleanup'
import { useTemporaryCopyCleanup } from '@/app/useTemporaryCopyCleanup'
import { useDeletedContactRetention } from '@/app/useDeletedContactRetention'
import { useGeocodeRetries } from '@/app/contacts/geocodeRetry'
import { useTimeEntryCreditNormalization } from '@/app/useTimeEntryCreditNormalization'
import { useCalendarSync } from '@/app/calendar/useCalendarSync'
import { useICloudSync } from '@/app/sync/useICloudSync'
import { useAccountBackup } from '@/app/account/useAccountBackup'
import { useAppFonts } from '@/app/useAppFonts'
import { initializeApp } from '@/app/initializeApp'
import { linking, navigationRef } from '@/features/contacts/lib/linking'
import { stopRecordingLaunchLinks } from '@/lib/launchLinks'
import { analytics } from '@/lib/analytics'
import { PointerTooltipLayer } from '@/components/ui/PointerTooltip'
import { PopoverTouchShield } from '@/components/ui/popoverTouchShield'
import ToastHost from '@/components/toast/ToastHost'
import AppLockGate from '@/app/app-lock/AppLockGate'
import UpdateRequiredGate from '@/app/update-required/UpdateRequiredGate'

initializeApp()

/**
 * Launch work that the first screen doesn't need. Each piece starts once that
 * screen is up, the heavier ones later still, so they don't compete with the
 * splash handing over. A component of its own so these stages don't re-render
 * the app.
 */
function LaunchWork() {
  const afterFirstScreen = useAfterLaunch('firstScreen')
  const afterReminderDelay = useAfterLaunch(2_000)
  // First, so the launch pull that rollover waits on starts straight away.
  useICloudSync(afterFirstScreen)
  // Each starts in its own idle period, in this order.
  useWidgetSync(useAfterLaunch('idle'))
  useWatchSync(useAfterLaunch('idle'))
  useCalendarSync(useAfterLaunch('idle'))
  useReconciledReminders(afterReminderDelay)
  useLocalAvatarCleanup(useAfterLaunch('idle'))
  useNoteImageCleanup(useAfterLaunch('idle'))
  useTemporaryCopyCleanup(useAfterLaunch('idle'))
  useDeletedContactRetention(useAfterLaunch('idle'))
  useGeocodeRetries(useAfterLaunch('idle'))
  useTimeEntryCreditNormalization(useAfterLaunch('idle'))
  useAccountBackup(useAfterLaunch('idle'))
  return null
}

export default function App() {
  // Before the device's first unlock, nothing past the splash may read or
  // write the User's data.
  if (!useStorageUnlock()) return <LaunchSplash />
  return <UnlockedApp />
}

function UnlockedApp() {
  perf.count('render:App')
  perf.mark('appFirstRender')
  const systemColorScheme = useColorScheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const { loadedLocale } = useUserLocalePrefs()
  const fontsLoaded = useAppFonts()
  const routeNameRef = useRef<string | undefined>(undefined)
  const devRemountKey = useDevRemountKey()
  const hasMigrated = useAppMigrations()
  const directionReloadDue = useLayoutDirectionReload()

  // Rendering anything hides the native splash, so keep showing its exact
  // replica until the app is ready — the first screen then picks up from it.
  if (!hasMigrated || !fontsLoaded || directionReloadDue) {
    return <LaunchSplash />
  }
  perf.mark('appTreeRender')

  return (
    <CustomerProvider>
      <LaunchWork />
      <AccountProvider>
        <FeatureFlagsRuntime />
        <ScribeRoot />
        <SupporterStoreSync />
        <SupporterSyncDefault />
        <CloudSyncDefault />
        <SupporterSyncLapseGate />
        <AppIconSync />
        <ThemeProvider>
          <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <DisplayRegionsObserver />
              <PopoverTouchShield>
                {/* Off except while the note editor is open (it pins its
                  toolbar to the keyboard); the rest of the app avoids the
                  keyboard with React Native's own events. */}
                <KeyboardProvider
                  enabled={false}
                  preload={false}
                  preserveEdgeToEdge
                >
                  <NavigationContainer
                    key={devRemountKey}
                    ref={navigationRef}
                    linking={linking}
                    // Shown while deep links resolve, before the first screen.
                    fallback={<LaunchSplash />}
                    onReady={() => {
                      // Every link listener is up now.
                      stopRecordingLaunchLinks()
                      markLaunched()
                      reportLaunch()
                      captureLaunchTiming()
                      const initialScreen =
                        navigationRef.current?.getCurrentRoute()?.name
                      routeNameRef.current = initialScreen
                      if (initialScreen) analytics.screen(initialScreen)
                    }}
                    onStateChange={() => {
                      const previousScreen = routeNameRef.current
                      const currentScreen =
                        navigationRef.current?.getCurrentRoute()?.name
                      if (currentScreen && currentScreen !== previousScreen) {
                        analytics.screen(currentScreen, {
                          previous_screen: previousScreen,
                        })
                      }
                      routeNameRef.current = currentScreen
                    }}
                  >
                    <TamaguiProvider
                      defaultTheme={
                        colorScheme
                          ? colorScheme
                          : systemColorScheme || undefined
                      }
                      config={tamaguiConfig}
                    >
                      <SystemBars />
                      <ConfettiProvider>
                        <AnimationViewProvider>
                          <SurveyProvider>
                            <DeepLinkListeners />
                            <BuddiesRuntime />
                            <BadgesRuntime />
                            <NotificationResponseListener />
                            <SilentForegroundAlerts />
                            <SystemMenu language={loadedLocale} />
                            <RootStackComponent />
                            <ToastHost />
                            <PointerTooltipLayer />
                            <UpdateRequiredGate />
                            {/* Last, so it covers everything else. */}
                            <AppLockGate />
                          </SurveyProvider>
                        </AnimationViewProvider>
                      </ConfettiProvider>
                    </TamaguiProvider>
                  </NavigationContainer>
                </KeyboardProvider>
              </PopoverTouchShield>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </ThemeProvider>
      </AccountProvider>
    </CustomerProvider>
  )
}
