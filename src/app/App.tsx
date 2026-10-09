import '../../env'
import '@/lib/locales'
import 'react-native-gesture-handler'
import React, { useRef } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { TamaguiProvider } from 'tamagui'
import { ToastProvider, ToastViewport } from '@tamagui/toast'
import tamaguiConfig from '../../tamagui.config'
import ThemeProvider from '@/providers/ThemeProvider'
import CustomerProvider from '@/providers/CustomerProvider'
import AccountProvider from '@/providers/AccountProvider'
import SurveyProvider from '@/providers/SurveyProvider'
import AnimationViewProvider from '@/providers/AnimationViewProvider'
import ConfettiProvider from '@/providers/ConfettiProvider'
import RootStackComponent from '@/app/navigation/RootStack'
import LaunchSplash from '@/app/launch/LaunchSplash'
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
import NotesImportAttestPreparation from '@/features/notes-import/components/NotesImportAttestPreparation'
import SupporterStoreSync from '@/features/supporter/components/SupporterStoreSync'
import SupporterSyncDefault from '@/app/sync/components/SupporterSyncDefault'
import SupporterSyncLapseGate from '@/app/sync/components/SupporterSyncLapseGate'
import AppIconSync from '@/features/settings/components/AppIconSync'
import { FeatureFlagsRuntime } from '@/lib/featureFlags'
import '@/lib/analyticsConsent'
import { usePreferences } from '@/stores/preferences'
import useUserLocalePrefs from '@/features/settings/hooks/useLocale'
import { useNotesImportResume } from '@/features/notes-import/hooks/useNotesImportResume'
import { useDevRemountKey } from '@/app/navigation/useDevRemountKey'
import { useAppMigrations } from '@/app/migrations/useAppMigrations'
import { useWidgetSync } from '@/app/widgets/useWidgetSync'
import { useWatchSync } from '@/app/watch/useWatchSync'
import { useReconciledReminders } from '@/app/notifications/useReconciledReminders'
import { useLocalAvatarCleanup } from '@/app/sync/useLocalAvatarCleanup'
import { useDeletedContactRetention } from '@/app/useDeletedContactRetention'
import { useTimeEntryCreditNormalization } from '@/app/useTimeEntryCreditNormalization'
import { useCalendarSync } from '@/app/calendar/useCalendarSync'
import { useICloudSync } from '@/app/sync/useICloudSync'
import { useAppFonts } from '@/app/useAppFonts'
import { initializeApp } from '@/app/initializeApp'
import { linking, navigationRef } from '@/features/contacts/lib/linking'
import { analytics } from '@/lib/analytics'
import { PointerTooltipLayer } from '@/components/ui/PointerTooltip'

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
  useDeletedContactRetention(useAfterLaunch('idle'))
  useTimeEntryCreditNormalization(useAfterLaunch('idle'))
  return null
}

export default function App() {
  perf.count('render:App')
  perf.mark('appFirstRender')
  const systemColorScheme = useColorScheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const { loadedLocale } = useUserLocalePrefs()
  const fontsLoaded = useAppFonts()
  const routeNameRef = useRef<string | undefined>(undefined)
  const devRemountKey = useDevRemountKey()
  useNotesImportResume()
  const hasMigrated = useAppMigrations()

  // Rendering anything hides the native splash, so keep showing its exact
  // replica until the app is ready — the first screen then picks up from it.
  if (!hasMigrated || !fontsLoaded) {
    return <LaunchSplash />
  }
  perf.mark('appTreeRender')

  return (
    <CustomerProvider>
      <LaunchWork />
      <AccountProvider>
        <FeatureFlagsRuntime />
        <NotesImportAttestPreparation />
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
                // Shown while deep links resolve, before the first screen.
                fallback={<LaunchSplash />}
                onReady={() => {
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
                {/* Toast context must also reach Tamagui’s portaled sheets. */}
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
                        <SurveyProvider>
                          <DeepLinkListeners />
                          <BuddiesRuntime />
                          <BadgesRuntime />
                          <NotificationResponseListener />
                          <SilentForegroundAlerts />
                          <SystemMenu language={loadedLocale} />
                          <RootStackComponent />
                          <PointerTooltipLayer />
                        </SurveyProvider>
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
}
