import { perf } from '@/lib/perf'
import { installPerfProbe } from '@/lib/perfProbe'
import * as Notifications from 'expo-notifications'
import { errorTracking } from '@/lib/errorTracking'
import { hotUpdater } from '@/lib/hotUpdater'
import { downloadUpdateOnLaunch } from '@/features/updates/lib/updates'
import { isLayoutDirectionReloadDue } from '@/app/launch/layoutDirection'
import Constants from 'expo-constants'
import { LogBox, Platform } from 'react-native'
import { isAudioEnabled } from '@/lib/audio'
import { configureLogger } from '@/lib/logger'
import { foregroundPresentation } from '@/app/notifications/foregroundPresentation'
import { usePreferences } from '@/stores/preferences'
import { registerAndroidSyncTransport } from '@/lib/syncTransport'
import { googleDriveTransport } from '@/lib/syncTransport/googleDrive/googleDriveTransport'
import { registerCloudSync } from '@/app/sync/cloudSync'
import { promptUnlockAtLaunch } from '@/app/app-lock/unlock'
import * as BuddiesKeychain from '../../modules/buddies-keychain'

export function initializeApp() {
  perf.mark('initializeApp')
  installPerfProbe()
  // First, so App Lock's Face ID runs while the first screen renders.
  promptUnlockAtLaunch()
  configureLogger(() => usePreferences.getState().developerTools)
  // Before anything syncs: Android syncs through Google Drive (ADR 0019).
  // iOS keeps iCloud, and its copy keeps naming iCloud.
  if (Platform.OS === 'android')
    registerAndroidSyncTransport(googleDriveTransport)
  // Cloud Sync (ADR 0030) needs the account key, so only binaries that can
  // hold one offer it.
  if (BuddiesKeychain.isAvailable()) registerCloudSync()

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
    updateChannel: hotUpdater.getChannel(),
    updateBundleId: hotUpdater.getBundleId(),
  })

  // A launch that reloads for its layout direction leaves the download to the
  // reloaded launch, so the reload can't pick up a bundle staged meanwhile.
  if (!isLayoutDirectionReloadDue()) void downloadUpdateOnLaunch()

  // Verification hooks (scripts/verify). The require keeps them out of release
  // bundles because Metro drops the dead branch before resolving it.
  if (__DEV__) {
    require('@/app/dev-harness/installDevHarness').installDevHarness()
  } else if (process.env.EXPO_PUBLIC_PERF_PROBE === '1') {
    // Profiling builds (scripts/perf). The env var is inlined, so the branch
    // is dead in every other release bundle too.
    require('@/app/dev-harness/perfSetup').installPerfSetup()
  }
}
