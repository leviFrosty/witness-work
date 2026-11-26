import { Platform } from 'react-native'
import * as Application from 'expo-application'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import { useSharedCarsSession } from '@/stores/sharedCarsSession'
import { useTerritoriesSession } from '@/stores/territoriesSession'
import {
  BUDDY_PUSH_KINDS,
  CAR_PUSH_KINDS,
  TERRITORY_PUSH_KINDS,
  type BadgePushKind,
  type BuddyPushKind,
  type CarPushKind,
  type JoinRequestPushKind,
  type TerritoryPushKind,
} from '@/features/buddies/lib/engine'
import type { PushAddress, PushTemplate } from '@/features/buddies/lib/relay'
import { buddiesFailureReason } from '@/features/buddies/lib/buddiesErrors'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export const BUDDIES_CHANNEL_ID = 'buddies'

export function ensureBuddiesChannel() {
  return Notifications.setNotificationChannelAsync(BUDDIES_CHANNEL_ID, {
    name: i18n.t('buddies_title'),
    importance: Notifications.AndroidImportance.HIGH,
  })
}

export const BUDDIES_NEWS_CHANNEL_ID = 'buddies_news'

export async function ensureBuddiesNewsChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(BUDDIES_NEWS_CHANNEL_ID, {
    name: i18n.t('buddies_newsChannelName'),
    importance: Notifications.AndroidImportance.LOW,
  })
}

async function pushAddress(): Promise<PushAddress> {
  if (!hasCapability('deviceNotifications'))
    throw new Error('Push needs a phone')
  const token = await Notifications.getDevicePushTokenAsync()
  if (Platform.OS === 'android') {
    await ensureBuddiesNewsChannel()
    await ensureBuddiesChannel()
    return {
      pushService: 'fcm',
      fcmToken: String(token.data),

      appAlerts: true,
    }
  }
  const environment =
    await Application.getIosPushNotificationServiceEnvironmentAsync()
  return {
    apnsToken: String(token.data),

    apnsEnvironment:
      environment === 'development' || !Device.isDevice
        ? 'sandbox'
        : 'production',

    ...(Application.applicationId
      ? { apnsTopic: Application.applicationId }
      : {}),
  }
}

async function pushKinds(): Promise<PushKind[]> {
  return [
    ...BUDDY_PUSH_KINDS,
    ...(await buddiesEngine.joinRequestPushKinds()),
    ...buddiesEngine.badgePushKinds(),
    ...(useSharedCarsSession.getState().running ? CAR_PUSH_KINDS : []),
    ...(useTerritoriesSession.getState().running ? TERRITORY_PUSH_KINDS : []),
  ]
}

export const buddiesPushTemplates = async (): Promise<
  Record<PushKind, PushTemplate>
> => {
  const template: PushTemplate = {
    title: i18n.t('buddies_pushFallbackTitle'),
    body: i18n.t('buddies_pushFallbackBody'),
  }
  return Object.fromEntries(
    (await pushKinds()).map((kind) => [kind, template])
  ) as Record<PushKind, PushTemplate>
}

let registration: Promise<void> = Promise.resolve()

type PushKind =
  | BuddyPushKind
  | JoinRequestPushKind
  | BadgePushKind
  | CarPushKind
  | TerritoryPushKind

const REGISTRATION_TIMEOUT_MS = 30 * 1000

function withTimeout(work: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('Buddies push registration timed out'))
    }, REGISTRATION_TIMEOUT_MS)
  })
  return Promise.race([work(controller.signal), timeout]).finally(() =>
    clearTimeout(timer)
  )
}

export function registerBuddiesPush(): Promise<void> {
  const run = registration.then(() => withTimeout(register))
  registration = run.catch(() => {})
  return run
}

async function register(signal: AbortSignal) {
  const { registeredInboxId, notificationsEnabled } = useBuddies.getState()

  if (registeredInboxId === null || !hasCapability('deviceNotifications'))
    return
  const permission = await Notifications.getPermissionsAsync()
  if (!permission.granted) {
    analytics.capture('buddies_push_registration', {
      outcome: 'skipped',
      reason: 'permission',
    })
    return
  }
  try {
    const outcome = await buddiesEngine.registerPush(
      {
        ...(await pushAddress()),
        kindSealed: true,
        templates: notificationsEnabled ? await buddiesPushTemplates() : {},
      },
      { signal }
    )
    if (outcome !== 'unchanged')
      analytics.capture('buddies_push_registration', { outcome })
  } catch (error) {
    analytics.capture('buddies_push_registration', {
      outcome: 'failed',
      reason: buddiesFailureReason(error),
    })
    throw error
  }
}
