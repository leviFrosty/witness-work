import { Platform } from 'react-native'

export type PlatformCapability =
  | 'homeScreenWidgets'
  | 'liveActivities'
  | 'siriShortcuts'
  | 'watchApps'
  | 'alternateAppIcons'
  | 'iCloudSync'
  | 'googleDriveSync'
  | 'calendarBridge'
  | 'deviceNotifications'
  | 'storeReview'
  | 'storeListings'
  | 'haptics'
  | 'appLock'
  | 'photoLibrarySave'
  | 'otaUpdates'
  | 'syncedPhotos'
  | 'scribeVoice'
  | 'scribePhotos'
  | 'sharedCars'

type OS = typeof Platform.OS

const capabilities: Record<PlatformCapability, readonly OS[]> = {
  homeScreenWidgets: ['ios'],
  liveActivities: ['ios'],
  siriShortcuts: ['ios'],
  watchApps: ['ios', 'android'],
  alternateAppIcons: ['ios'],
  iCloudSync: ['ios'],
  googleDriveSync: ['android'],
  calendarBridge: ['ios', 'android'],
  deviceNotifications: ['ios', 'android'],
  storeReview: ['ios', 'android'],
  storeListings: ['ios', 'android'],
  haptics: ['ios', 'android'],
  appLock: ['ios', 'android', 'web'],
  photoLibrarySave: ['ios', 'android'],
  otaUpdates: ['ios', 'android'],
  syncedPhotos: ['ios', 'android'],
  scribeVoice: ['ios', 'android'],
  scribePhotos: ['ios', 'android'],
  sharedCars: ['ios', 'android'],
}

export function hasCapability(capability: PlatformCapability): boolean {
  return capabilities[capability].includes(Platform.OS)
}
