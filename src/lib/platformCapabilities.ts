import { Platform } from 'react-native'

/**
 * Platform features some platforms don't have at all. The web has none of these
 * (ADR 0037 §1), and their entry points are hidden there rather than shown
 * broken. A feature that also needs a native module or a newer binary checks
 * that as well.
 *
 * Features that will get a web version (Buddies, Scribe AI, the Map, backups,
 * imports) aren't listed: they check their own availability.
 */
export type PlatformCapability =
  /** Home Screen widgets (iOS). */
  | 'homeScreenWidgets'
  /** Live Activities on the Lock Screen and Dynamic Island (iOS). */
  | 'liveActivities'
  /** Siri and the Shortcuts app (iOS). */
  | 'siriShortcuts'
  /** The Apple Watch and Wear OS apps. */
  | 'watchApps'
  /** Alternate app icons (iOS). */
  | 'alternateAppIcons'
  /** Sync and restore through iCloud (iOS). */
  | 'iCloudSync'
  /** Sync and restore through Google Drive (Android, ADR 0019). */
  | 'googleDriveSync'
  /** Calendar Sync with the device's calendars. */
  | 'calendarBridge'
  /** Reminders and other notifications from the device. */
  | 'deviceNotifications'
  /** The App Store or Play rating prompt. */
  | 'storeReview'
  /** Hot Updater updates; each web page load runs the newest deploy. */
  | 'otaUpdates'

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
  otaUpdates: ['ios', 'android'],
}

/** Whether this platform has `capability` at all. */
export function hasCapability(capability: PlatformCapability): boolean {
  return capabilities[capability].includes(Platform.OS)
}
