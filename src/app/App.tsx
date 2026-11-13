import '../../env'
import '@/lib/locales'
import { useLayoutDirectionReload } from '@/app/launch/layoutDirection'
import 'react-native-gesture-handler'
import React, { useRef } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Platform, useColorScheme } from 'react-native'
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
import WebBannersLayout from '@/app/web-banners/WebBannersLayout'
import WebOfflineRuntime from '@/app/web-offline/WebOfflineRuntime'
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
import MileageSharingProvider from '@/app/mileage/MileageSharingProvider'
import TerritorySharingProvider from '@/app/territories/TerritorySharingProvider'
import SharedCarsRuntime from '@/app/sharedCars/SharedCarsRuntime'
import TerritoriesRuntime from '@/app/territories/TerritoriesRuntime'
import TerritoryVisitTally from '@/app/territories/TerritoryVisitTally'
import BadgesRuntime from '@/app/badges/BadgesRuntime'
import '@/app/buddies/buddiesBackgroundSync'
import NotificationResponseListener from '@/app/notifications/NotificationResponseListener'
import SilentForegroundAlerts from '@/app/notifications/SilentForegroundAlerts'
import SystemMenu from '@/app/menu-bar/SystemMenu'
import { ScribeRoot } from '@/features/scribe'
import SupporterStoreSync from '@/features/supporter/components/SupporterStoreSync'
import PlatformSyncDefault from '@/app/sync/components/PlatformSyncDefault'
import CloudSyncDefault from '@/app/sync/components/CloudSyncDefault'
import AppIconSync from '@/features/settings/components/AppIconSync'
import { FeatureFlagsRuntime } from '@/lib/featureFlags'
import '@/lib/analyticsConsent'
import { useSessionReplay } from '@/lib/sessionReplay/useSessionReplay'
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
import WebFocusStyles from '@/components/ui/WebFocusStyles'
import SubmitShortcut from '@/components/ui/SubmitShortcut'
import { PopoverTouchShield } from '@/components/ui/popoverTouchShield'
import ToastHost from '@/components/toast/ToastHost'
import WebStorageNotices from '@/app/launch/WebStorageNotices'
import AppLockGate from '@/app/app-lock/AppLockGate'
import WebAppLockBoundary from '@/app/app-lock/WebAppLockBoundary'
import StepUpSheet from '@/app/step-up/StepUpSheet'
import UpdateRequiredGate from '@/app/update-required/UpdateRequiredGate'
import WebSignInGate from '@/app/web-sign-in/WebSignInGate'

const isWeb = Platform.OS === 'web'

initializeApp()

function LaunchWork() {
  const afterFirstScreen = useAfterLaunch('firstScreen')
  const afterReminderDelay = useAfterLaunch(2_000)

  useICloudSync(afterFirstScreen)

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
  useSessionReplay(useAfterLaunch('idle'))
  return null
}

export default function App() {
  if (!useStorageUnlock()) return <LaunchSplash />
  return (
    <WebSignInGate>
      <WebAppLockBoundary>
        <UnlockedApp />
      </WebAppLockBoundary>
    </WebSignInGate>
  )
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
        <PlatformSyncDefault />
        <CloudSyncDefault />
        <AppIconSync />
        <ThemeProvider>
          <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <DisplayRegionsObserver />
              <PopoverTouchShield>
                {}
                <KeyboardProvider
                  enabled={false}
                  preload={false}
                  preserveEdgeToEdge
                >
                  <WebBannersLayout>
                    <NavigationContainer
                      key={devRemountKey}
                      ref={navigationRef}
                      linking={linking}
                      fallback={<LaunchSplash />}
                      onReady={() => {
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
                              <SharedCarsRuntime />
                              <TerritoriesRuntime />
                              <TerritoryVisitTally />
                              <BadgesRuntime />
                              <NotificationResponseListener />
                              <SilentForegroundAlerts />
                              <SystemMenu language={loadedLocale} />
                              <MileageSharingProvider>
                                <TerritorySharingProvider>
                                  <RootStackComponent />
                                </TerritorySharingProvider>
                              </MileageSharingProvider>
                              <ToastHost />
                              <WebStorageNotices />
                              <WebOfflineRuntime />
                              <PointerTooltipLayer />
                              <WebFocusStyles />
                              <SubmitShortcut />
                              <UpdateRequiredGate />
                              {}
                              {isWeb && <StepUpSheet />}
                              {}
                              <AppLockGate />
                            </SurveyProvider>
                          </AnimationViewProvider>
                        </ConfettiProvider>
                      </TamaguiProvider>
                    </NavigationContainer>
                  </WebBannersLayout>
                </KeyboardProvider>
              </PopoverTouchShield>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </ThemeProvider>
      </AccountProvider>
    </CustomerProvider>
  )
}
