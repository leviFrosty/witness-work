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

const BACKGROUND_BUDGET_MS = 20 * 1000

const BACKGROUND_REQUEST_TIMEOUT_MS = 8 * 1000

type PushPayload = Exclude<
  Notifications.NotificationTaskPayload,
  { actionIdentifier: string }
>

export const isBuddiesPush = (
  payload: Notifications.NotificationTaskPayload
): payload is PushPayload =>
  !('actionIdentifier' in payload) && pushMarkerOf(payload.data) !== null

function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) =>
    signal.addEventListener('abort', () =>
      reject(new Error('Buddies background push ran out of time'))
    )
  )
}

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
  outOfTime.catch(() => {})
  const started =
    BuddiesKeychain.isAvailable() &&
    useBuddies.getState().registeredInboxId !== null
  const before = useBuddies.getState().syncSeq
  try {
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
