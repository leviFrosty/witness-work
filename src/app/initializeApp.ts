import * as Notifications from 'expo-notifications'
import { errorTracking } from '@/lib/errorTracking'
import * as Updates from 'expo-updates'
import Constants from 'expo-constants'
import { LogBox } from 'react-native'

export function initializeApp() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
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
