import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'

import { postBuddiesAlert } from '@/app/buddies/buddiesPushAlerts'
import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { pushMarkerOf } from '@/features/buddies/lib/pushAlerts'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const BUDDIES_PUSH_TASK = 'buddies-push-sync'
/**
 * Background time per push is about 30 seconds on iOS; Android allows a high
 * priority FCM message about 20 seconds before the job may be cut short, but
 * the sync keeps running while the process lives.
 */
const BACKGROUND_SYNC_TIMEOUT_MS = 25 * 1000

type PushPayload = Exclude<
  Notifications.NotificationTaskPayload,
  { actionIdentifier: string }
>

export const isBuddiesPush = (
  payload: Notifications.NotificationTaskPayload
): payload is PushPayload =>
  !('actionIdentifier' in payload) && pushMarkerOf(payload.data) !== null

/**
 * A Buddies push wakes the app in the background (`content-available` on iOS, a
 * data-only FCM message on Android), so what it announced is already pulled
 * when the User opens the app. On Android it also posts the push's alert. While
 * the app is open, BuddiesRuntime's received listener does both instead.
 */
async function syncForPush(payload: Notifications.NotificationTaskPayload) {
  if (!isBuddiesPush(payload) || AppState.currentState === 'active')
    return Notifications.BackgroundNotificationTaskResult.NoData
  // Android's FCM message has no title: the alert is the app's to post (first,
  // so it doesn't wait on the sync). iOS's extension words it instead.
  await postBuddiesAlert(payload.data).catch((error) =>
    logger.warn('[buddies] background push alert', error)
  )
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
