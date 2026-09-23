import '../../env'
import '@/lib/locales'
import 'react-native-gesture-handler'
import React, { useRef } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ActivityIndicator, useColorScheme, View } from 'react-native'
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
import DeepLinkListeners from '@/app/deep-links/DeepLinkListeners'
import NotesImportAttestPreparation from '@/features/notes-import/components/NotesImportAttestPreparation'
import SupporterStoreSync from '@/features/supporter/components/SupporterStoreSync'
import SupporterSyncDefault from '@/app/sync/components/SupporterSyncDefault'
import SupporterSyncLapseGate from '@/app/sync/components/SupporterSyncLapseGate'
import AppIconSync from '@/features/settings/components/AppIconSync'
import { useInitializeFeatureFlags } from '@/lib/featureFlags'
import { usePreferences } from '@/stores/preferences'
import useUserLocalePrefs from '@/features/settings/hooks/useLocale'
import { useNotesImportResume } from '@/features/notes-import/hooks/useNotesImportResume'
import { useDevRemountKey } from '@/app/navigation/useDevRemountKey'
import { useAppMigrations } from '@/app/migrations/useAppMigrations'
import { useWidgetSync } from '@/app/widgets/useWidgetSync'
import { useICloudSync } from '@/app/sync/useICloudSync'
import { useCalendarSync } from '@/app/calendar/useCalendarSync'
import { useDataProtectionRetentionPrompt } from '@/app/data-protection/useDataProtectionRetentionPrompt'
import { useAppFonts } from '@/app/useAppFonts'
import { initializeApp } from '@/app/initializeApp'
import { linking, navigationRef } from '@/features/contacts/lib/linking'
import { analytics } from '@/lib/analytics'
import { errorTracking } from '@/lib/errorTracking'

initializeApp()

export default function App() {
  useInitializeFeatureFlags()
  const systemColorScheme = useColorScheme()
  const { colorScheme } = usePreferences()
  useUserLocalePrefs()
  const fontsLoaded = useAppFonts()
  const routeNameRef = useRef<string | undefined>(undefined)
  const devRemountKey = useDevRemountKey()
  useNotesImportResume()
  const hasMigrated = useAppMigrations()
  useWidgetSync(hasMigrated)
  useICloudSync(hasMigrated)
  useCalendarSync(hasMigrated)
  useDataProtectionRetentionPrompt(!!hasMigrated)

  if (!hasMigrated) {
    return (
      <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1 }}>
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
                  onReady={() => {
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
                          <SurveyProvider>
                            <DeepLinkListeners />
                            <RootStackComponent />
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
  } catch (error) {
    errorTracking.captureException(error)
  }
}
