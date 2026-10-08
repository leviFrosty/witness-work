import { perf } from '@/lib/perf'
import { installPerfProbe } from '@/lib/perfProbe'
import * as Notifications from 'expo-notifications'
import { errorTracking } from '@/lib/errorTracking'
import * as Updates from 'expo-updates'
import Constants from 'expo-constants'
import { LogBox, Platform } from 'react-native'
import { isAudioEnabled } from '@/lib/audio'
import { configureLogger } from '@/lib/logger'
import { foregroundPresentation } from '@/app/notifications/foregroundPresentation'
import { usePreferences } from '@/stores/preferences'
import { registerAndroidSyncTransport } from '@/lib/syncTransport'
import { googleDriveTransport } from '@/lib/syncTransport/googleDrive/googleDriveTransport'

export function initializeApp() {
  perf.mark('initializeApp')
  installPerfProbe()
  configureLogger(() => usePreferences.getState().developerTools)
  // Before anything syncs: Android syncs through Google Drive (ADR 0019).
  // iOS keeps iCloud, and its copy keeps naming iCloud.
  if (Platform.OS === 'android')
    registerAndroidSyncTransport(googleDriveTransport)

  Notifications.setNotificationHandler({
    handleNotification: async (notification) =>
      foregroundPresentation(notification, { audioEnabled: isAudioEnabled() }),
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

  // Verification hooks (scripts/verify). The require keeps them out of release
  // bundles because Metro drops the dead branch before resolving it.
  if (__DEV__) {
    require('@/app/dev-harness/installDevHarness').installDevHarness()
  }
}
