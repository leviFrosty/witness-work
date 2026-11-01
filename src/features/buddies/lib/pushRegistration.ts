import { Platform } from 'react-native'
import * as Application from 'expo-application'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { useSharedCarsSession } from '@/stores/sharedCarsSession'
import type {
  BadgePushKind,
  BuddyPushKind,
  CarPushKind,
  JoinRequestPushKind,
} from '@/features/buddies/lib/engine'
import type { PushAddress, PushTemplate } from '@/features/buddies/lib/relay'
import { buddiesFailureReason } from '@/features/buddies/lib/buddiesErrors'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const pushTemplates = (): Record<BuddyPushKind, PushTemplate> => ({
  'invite.claimed': {
    title: i18n.t('buddies_pushInviteClaimedTitle'),
    body: i18n.t('buddies_pushInviteClaimedBody'),
  },
  'pair.confirmed': {
    title: i18n.t('buddies_pushPairConfirmedTitle'),
    body: i18n.t('buddies_pushPairConfirmedBody'),
  },
  'plan.invite': {
    title: i18n.t('buddies_pushPlanInviteTitle'),
    body: i18n.t('buddies_pushPlanInviteBody'),
  },
  'plan.update': {
    title: i18n.t('buddies_pushPlanUpdateTitle'),
    body: i18n.t('buddies_pushPlanUpdateBody'),
  },
  'plan.cancel': {
    title: i18n.t('buddies_pushPlanCancelTitle'),
    body: i18n.t('buddies_pushPlanCancelBody'),
  },
  'followup.invite': {
    title: i18n.t('buddies_pushFollowUpInviteTitle'),
    body: i18n.t('buddies_pushFollowUpInviteBody'),
  },
  'followup.update': {
    title: i18n.t('buddies_pushFollowUpUpdateTitle'),
    body: i18n.t('buddies_pushFollowUpUpdateBody'),
  },
  'followup.cancel': {
    title: i18n.t('buddies_pushFollowUpCancelTitle'),
    body: i18n.t('buddies_pushFollowUpCancelBody'),
  },
  'share.reply': {
    title: i18n.t('buddies_pushShareReplyTitle'),
    body: i18n.t('buddies_pushShareReplyBody'),
  },
})

const joinRequestTemplates = async (): Promise<
  Record<JoinRequestPushKind, PushTemplate>
> => {
  const template = {
    title: i18n.t('buddies_pushJoinRequestTitle'),
    body: i18n.t('buddies_pushJoinRequestBody'),
  }
  return Object.fromEntries(
    (await buddiesEngine.joinRequestPushKinds()).map((kind) => [kind, template])
  ) as Record<JoinRequestPushKind, PushTemplate>
}

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

const badgeTemplates = (): Partial<Record<BadgePushKind, PushTemplate>> => {
  const templates: Record<BadgePushKind, PushTemplate> = {
    'badge.new': {
      title: i18n.t('buddies_pushBadgeTitle'),
      body: i18n.t('buddies_pushBadgeBody'),
    },
    'badge.reaction': {
      title: i18n.t('buddies_pushBadgeReactionTitle'),
      body: i18n.t('buddies_pushBadgeBody'),
    },
  }
  return Object.fromEntries(
    buddiesEngine.badgePushKinds().map((kind) => [kind, templates[kind]])
  )
}

const carTemplates = (): Partial<Record<CarPushKind, PushTemplate>> =>
  useSharedCarsSession.getState().running
    ? {
        'car.invite': {
          title: i18n.t('buddies_pushCarInviteTitle'),
          body: i18n.t('buddies_pushCarInviteBody'),
        },
        'car.reply': {
          title: i18n.t('buddies_pushCarJoinedTitle'),
          body: i18n.t('buddies_pushCarJoinedBody'),
        },
      }
    : {}

export const buddiesPushTemplates = async () => ({
  ...pushTemplates(),
  ...(await joinRequestTemplates()),
  ...badgeTemplates(),
  ...carTemplates(),
})

let registration: Promise<void> = Promise.resolve()

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
  if (registeredInboxId === null) return
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
