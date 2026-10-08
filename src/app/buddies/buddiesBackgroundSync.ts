import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'

import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const BUDDIES_PUSH_TASK = 'buddies-push-sync'
/**
 * Background time per push is about 30 seconds on iOS; Android allows a high
 * priority FCM message about 20 seconds before the job may be cut short, but
 * the sync keeps running while the process lives.
 */
const BACKGROUND_SYNC_TIMEOUT_MS = 25 * 1000

/**
 * The push's `ww` marker: among the APNs payload's keys on iOS, and in the FCM
 * data's JSON `body` (`dataString`) on Android.
 */
function pushMarker(data: { [key: string]: unknown } | undefined) {
  if (data?.ww !== undefined) return data.ww
  if (typeof data?.dataString !== 'string') return undefined
  try {
    return (JSON.parse(data.dataString) as { ww?: unknown } | null)?.ww
  } catch {
    return undefined
  }
}

export const isBuddiesPush = (
  payload: Notifications.NotificationTaskPayload
) => {
  if ('actionIdentifier' in payload) return false
  const marker = pushMarker(payload.data)
  return typeof marker === 'object' && marker !== null && 'kind' in marker
}

/**
 * A Buddies push wakes the app in the background (`content-available` on iOS, a
 * data-only FCM message on Android), so what it announced is already pulled
 * when the User opens the app. While the app is open, BuddiesRuntime's received
 * listener syncs instead.
 */
async function syncForPush(payload: Notifications.NotificationTaskPayload) {
  if (!isBuddiesPush(payload) || AppState.currentState === 'active')
    return Notifications.BackgroundNotificationTaskResult.NoData
  if (
    !BuddiesKeychain.isAvailable() ||
    useBuddies.getState().registeredInboxId === null
  )
    return Notifications.BackgroundNotificationTaskResult.NoData
  const before = useBuddies.getState().syncSeq
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      buddiesEngine.sync(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Buddies background sync timed out')),
          BACKGROUND_SYNC_TIMEOUT_MS
        )
      }),
    ])
    return useBuddies.getState().syncSeq === before
      ? Notifications.BackgroundNotificationTaskResult.NoData
      : Notifications.BackgroundNotificationTaskResult.NewData
  } catch (error) {
    logger.warn('[buddies] background push sync', error)
    return Notifications.BackgroundNotificationTaskResult.Failed
  } finally {
    clearTimeout(timer)
  }
}

// Defined at module load so the system finds the task when a push launches the
// app in the background.
if (
  (Platform.OS === 'ios' || Platform.OS === 'android') &&
  !TaskManager.isTaskDefined(BUDDIES_PUSH_TASK)
) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    BUDDIES_PUSH_TASK,
    ({ data }) => syncForPush(data)
  )
  Notifications.registerTaskAsync(BUDDIES_PUSH_TASK).catch((error) =>
    logger.warn('[buddies] background push task', error)
  )
}
