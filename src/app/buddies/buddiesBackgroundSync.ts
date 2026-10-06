import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'

import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const BUDDIES_PUSH_TASK = 'buddies-push-sync'
/** Background time per push is about 30 seconds on iOS. */
const BACKGROUND_SYNC_TIMEOUT_MS = 25 * 1000

const isBuddiesPush = (payload: Notifications.NotificationTaskPayload) => {
  if ('actionIdentifier' in payload) return false
  const marker = payload.data?.ww
  return typeof marker === 'object' && marker !== null && 'kind' in marker
}

/**
 * A Buddies push wakes the app in the background (`content-available`), so what
 * it announced is already pulled when the User opens the app. While the app is
 * open, BuddiesRuntime's received listener syncs instead.
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

// Defined at module load so iOS finds the task when a push launches the app in
// the background.
if (Platform.OS === 'ios' && !TaskManager.isTaskDefined(BUDDIES_PUSH_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    BUDDIES_PUSH_TASK,
    ({ data }) => syncForPush(data)
  )
  Notifications.registerTaskAsync(BUDDIES_PUSH_TASK).catch((error) =>
    logger.warn('[buddies] background push task', error)
  )
}
