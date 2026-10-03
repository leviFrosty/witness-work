import * as Notifications from 'expo-notifications'
import { errorTracking } from '@/lib/errorTracking'
import * as Updates from 'expo-updates'
import Constants from 'expo-constants'
import { LogBox } from 'react-native'
import { isAudioEnabled } from '@/lib/audio'
import { configureLogger } from '@/lib/logger'
import { usePreferences } from '@/stores/preferences'

export function initializeApp() {
  configureLogger(() => usePreferences.getState().developerTools)

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      // Reminders that arrive while the app is open follow the in-app Audio
      // setting. Delivered in the background, the system's notification
      // settings decide. Android drops the banner of a silent alert, so
      // `SilentForegroundAlerts` shows one in the app.
      shouldPlaySound: isAudioEnabled(),
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })

  // Suppress the known Tamagui animated-listener warning.
  LogBox.ignoreLogs([
    'Sending `onAnimatedValueUpdate` with no listeners registered.',
  ])

  errorTracking.setContext({
    deviceId: Constants.sessionId,
    appOwnership: Constants.appOwnership || 'N/A',
    ...(Constants.appOwnership === 'expo' && Constants.expoVersion
      ? { expoAppVersion: Constants.expoVersion }
      : {}),
    expoChannel: Updates.channel,
    expoUpdateVersion: Updates.updateId,
  })
}
