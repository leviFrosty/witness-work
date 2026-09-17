import * as Notifications from 'expo-notifications'
import * as Sentry from '@sentry/react-native'
import * as Updates from 'expo-updates'
import Constants from 'expo-constants'
import { LogBox } from 'react-native'
import { isOfflineError } from '@/lib/offlineError'
import { isLocationTemporarilyUnavailableError } from '@/lib/locationError'

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

  Sentry.init({
    dsn: 'https://f9600209459a43d18c3d2c3a6ac2aa7b@o572512.ingest.sentry.io/4505271593074688',
    enabled: !__DEV__,
    debug: __DEV__,
    attachScreenshot: true,
    // Drop expected environmental failures rather than reporting them as app
    // errors. Returning null discards the event.
    beforeSend: (event, hint) =>
      isOfflineError(hint?.originalException) ||
      isLocationTemporarilyUnavailableError(hint?.originalException)
        ? null
        : event,
  })

  Sentry.setTag('deviceId', Constants.sessionId)
  Sentry.setTag('appOwnership', Constants.appOwnership || 'N/A')
  if (Constants.appOwnership === 'expo' && Constants.expoVersion) {
    Sentry.setTag('expoAppVersion', Constants.expoVersion)
  }
  Sentry.setTag('expoChannel', Updates.channel)
  Sentry.setTag('expoUpdateVersion', Updates.updateId)
}
