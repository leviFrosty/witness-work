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
 * priority FCM message about 20 seconds before the job may be cut short.
 * Posting the alert and syncing both finish, or are cancelled, inside this.
 */
const BACKGROUND_BUDGET_MS = 20 * 1000
/** Each relay call's limit here, so one stalled call leaves time for the rest. */
const BACKGROUND_REQUEST_TIMEOUT_MS = 8 * 1000

type PushPayload = Exclude<
  Notifications.NotificationTaskPayload,
  { actionIdentifier: string }
>

export const isBuddiesPush = (
  payload: Notifications.NotificationTaskPayload
): payload is PushPayload =>
  !('actionIdentifier' in payload) && pushMarkerOf(payload.data) !== null

/** Rejects once `signal` aborts, for work that can't be cancelled itself. */
function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) =>
    signal.addEventListener('abort', () =>
      reject(new Error('Buddies background push ran out of time'))
    )
  )
}

/**
 * A Buddies push wakes the app in the background (`content-available` on iOS, a
 * data-only FCM message on Android), so what it announced is already pulled
 * when the User opens the app. On Android it also posts the push's alert, at
 * the same time: the alert words itself from the event the sync reads. While
 * the app is open, BuddiesRuntime's received listener does both instead.
 */
async function syncForPush(payload: Notifications.NotificationTaskPayload) {
  if (!isBuddiesPush(payload) || AppState.currentState === 'active')
    return Notifications.BackgroundNotificationTaskResult.NoData
  const controller = new AbortController()
  const budget = setTimeout(() => controller.abort(), BACKGROUND_BUDGET_MS)
  const call = {
    signal: controller.signal,
    timeoutMs: BACKGROUND_REQUEST_TIMEOUT_MS,
  }
  const outOfTime = untilAborted(controller.signal)
  outOfTime.catch(() => {
    // Each race below reports it.
  })
  const started =
    BuddiesKeychain.isAvailable() &&
    useBuddies.getState().registeredInboxId !== null
  const before = useBuddies.getState().syncSeq
  try {
    // Started first, so the alert finds the sync running and reads its event.
    const synced = started
      ? Promise.race([
          buddiesEngine.sync({ ...call, automatic: true }),
          outOfTime,
        ]).then(
          () => true,
          (error: unknown) => {
            logger.warn('[buddies] background push sync', error)
            return false
          }
        )
      : Promise.resolve(null)
    // Android's FCM message has no title: the alert is the app's to post. iOS's
    // extension words it instead.
    const alerted = Promise.race([
      postBuddiesAlert(payload.data, controller.signal),
      outOfTime,
    ]).catch((error: unknown) =>
      logger.warn('[buddies] background push alert', error)
    )
    const [outcome] = await Promise.all([synced, alerted])
    if (outcome === null)
      return Notifications.BackgroundNotificationTaskResult.NoData
    if (!outcome) return Notifications.BackgroundNotificationTaskResult.Failed
    return useBuddies.getState().syncSeq === before
      ? Notifications.BackgroundNotificationTaskResult.NoData
      : Notifications.BackgroundNotificationTaskResult.NewData
  } finally {
    clearTimeout(budget)
    controller.abort()
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
