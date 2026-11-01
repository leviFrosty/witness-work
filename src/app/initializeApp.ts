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
import { registerRewardProbe, registerRewardSample } from '@/lib/actionRewards'
import {
  petRewardProbe,
  playPetRewardSample,
} from '@/features/pet/components/PetRewardChip'
import * as BuddiesKeychain from '../../modules/buddies-keychain'

export function initializeApp() {
  perf.mark('initializeApp')
  installPerfProbe()

  promptUnlockAtLaunch()
  configureLogger(() => usePreferences.getState().developerTools)

  if (Platform.OS === 'android')
    registerAndroidSyncTransport(googleDriveTransport)

  if (BuddiesKeychain.isAvailable()) registerCloudSync()

  registerRewardProbe(petRewardProbe)
  registerRewardSample(playPetRewardSample)

  Notifications.setNotificationHandler({
    handleNotification: async (notification) =>
      foregroundPresentation(notification, { audioEnabled: isAudioEnabled() }),
  })

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

  if (!isLayoutDirectionReloadDue()) void downloadUpdateOnLaunch()

  if (__DEV__) {
    require('@/app/dev-harness/installDevHarness').installDevHarness()
  } else if (process.env.EXPO_PUBLIC_PERF_PROBE === '1') {
    require('@/app/dev-harness/perfSetup').installPerfSetup()
  }
}
