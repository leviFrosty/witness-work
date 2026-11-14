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
  | 'syncedAvatarPhotos'
  | 'syncedNotePhotos'
  | 'scribeVoice'
  | 'scribePhotos'
  | 'sharedCars'
  | 'territorySharing'
  | 'camera'
  | 'reverseGeocoding'
  | 'appSettings'

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
  syncedAvatarPhotos: ['ios', 'android'],
  syncedNotePhotos: ['ios', 'android', 'web'],
  scribeVoice: ['ios', 'android'],
  scribePhotos: ['ios', 'android'],
  sharedCars: ['ios', 'android'],
  territorySharing: ['ios', 'android'],
  camera: ['ios', 'android'],
  reverseGeocoding: ['ios', 'android'],
  appSettings: ['ios', 'android'],
}

export function hasCapability(capability: PlatformCapability): boolean {
  return capabilities[capability].includes(Platform.OS)
}
