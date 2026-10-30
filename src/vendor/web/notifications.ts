import type * as Notifications from 'expo-notifications'
import { PermissionStatus } from 'expo'

/**
 * Stands in for expo-notifications in the web build (see
 * `metro/bundleRedirects.js`). The web has no device notifications (ADR 0037
 * §1): permission is never granted, nothing is scheduled or delivered, and
 * every listener stays silent. Entry points that ask for notifications are
 * hidden there (`@/lib/platformCapabilities`). The types and enums are the
 * package's own; they load nothing native.
 */
export * from 'expo-notifications/build/Notifications.types'
export * from 'expo-notifications/build/NotificationChannelManager.types'
export * from 'expo-notifications/build/NotificationPermissions.types'

export const DEFAULT_ACTION_IDENTIFIER =
  'expo.modules.notifications.actions.DEFAULT'

export enum BackgroundNotificationTaskResult {
  NewData = 0,
  NoData = 1,
  Failed = 2,
}

const silent = { remove() {} }

const denied: Notifications.NotificationPermissionsStatus = {
  status: PermissionStatus.DENIED,
  granted: false,
  canAskAgain: false,
  expires: 'never',
}

const facade = {
  setNotificationHandler: () => {},
  addNotificationReceivedListener: () => silent,
  addNotificationResponseReceivedListener: () => silent,
  addPushTokenListener: () => silent,
  getLastNotificationResponse: () => null,
  clearLastNotificationResponse: () => {},
  getPermissionsAsync: async () => denied,
  requestPermissionsAsync: async () => denied,
  scheduleNotificationAsync: async () => '',
  getAllScheduledNotificationsAsync: async () => [],
  cancelScheduledNotificationAsync: async () => {},
  cancelAllScheduledNotificationsAsync: async () => {},
  getPresentedNotificationsAsync: async () => [],
  dismissNotificationAsync: async () => {},
  setNotificationChannelAsync: async () => null,
  setBadgeCountAsync: async () => false,
  getDevicePushTokenAsync: () =>
    Promise.reject(new Error('The web has no push notifications')),
  registerTaskAsync: async () => null,
} satisfies Partial<typeof Notifications>

export const {
  setNotificationHandler,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  addPushTokenListener,
  getLastNotificationResponse,
  clearLastNotificationResponse,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  getAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync,
  cancelAllScheduledNotificationsAsync,
  getPresentedNotificationsAsync,
  dismissNotificationAsync,
  setNotificationChannelAsync,
  setBadgeCountAsync,
  getDevicePushTokenAsync,
  registerTaskAsync,
} = facade
