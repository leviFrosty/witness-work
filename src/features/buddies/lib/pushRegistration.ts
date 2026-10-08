import { Platform } from 'react-native'
import * as Application from 'expo-application'
import * as Notifications from 'expo-notifications'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type {
  BadgePushKind,
  BuddyPushKind,
  JoinRequestPushKind,
} from '@/features/buddies/lib/engine'
import type { PushAddress, PushTemplate } from '@/features/buddies/lib/relay'
import { buddiesFailureReason } from '@/features/buddies/lib/buddiesErrors'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** Localized on the device; the relay fills pushes with no user content. */
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

/**
 * One template per buddy whose requests to join may alert this device, all with
 * the same text; a muted buddy's kind is left out.
 */
const joinRequestTemplates = (): Record<JoinRequestPushKind, PushTemplate> => {
  const template = {
    title: i18n.t('buddies_pushJoinRequestTitle'),
    body: i18n.t('buddies_pushJoinRequestBody'),
  }
  return Object.fromEntries(
    buddiesEngine.joinRequestPushKinds().map((kind) => [kind, template])
  ) as Record<JoinRequestPushKind, PushTemplate>
}

/**
 * The Android channel Buddies alerts are posted in. Created before registering,
 * so it exists before any alert.
 */
export const BUDDIES_CHANNEL_ID = 'buddies'

export function ensureBuddiesChannel() {
  return Notifications.setNotificationChannelAsync(BUDDIES_CHANNEL_ID, {
    name: i18n.t('buddies_title'),
    importance: Notifications.AndroidImportance.HIGH,
  })
}

/**
 * Buddies' social news (a new badge, a reaction) on Android: low importance, so
 * it lands in the shade without sound or a heads-up banner.
 */
export const BUDDIES_NEWS_CHANNEL_ID = 'buddies_news'

export async function ensureBuddiesNewsChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(BUDDIES_NEWS_CHANNEL_ID, {
    name: i18n.t('buddies_newsChannelName'),
    importance: Notifications.AndroidImportance.LOW,
  })
}

/** APNs on iOS; FCM, through Google Play services, on Android. */
async function pushAddress(): Promise<PushAddress> {
  const token = await Notifications.getDevicePushTokenAsync()
  if (Platform.OS === 'android') {
    await ensureBuddiesNewsChannel()
    await ensureBuddiesChannel()
    return {
      pushService: 'fcm',
      fcmToken: String(token.data),
      // This build posts its own named alerts (`postBuddiesAlert`).
      appAlerts: true,
    }
  }
  const environment =
    await Application.getIosPushNotificationServiceEnvironmentAsync()
  return {
    apnsToken: String(token.data),
    // Dev-client and simulator builds talk to the APNs sandbox.
    apnsEnvironment: environment === 'production' ? 'production' : 'sandbox',
    // Beta and production are separate apps with their own APNs topic.
    ...(Application.applicationId
      ? { apnsTopic: Application.applicationId }
      : {}),
  }
}

/**
 * A buddy's new badges, and a buddy's reaction to one of this User's badges,
 * while badge alerts are on here. Generic on purpose: the relay stores this
 * text, so it never names anyone.
 */
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

/**
 * Every template this device registers while Buddies notifications are on: the
 * relay's alert text, which the app replaces with a named alert.
 */
export const buddiesPushTemplates = () => ({
  ...pushTemplates(),
  ...joinRequestTemplates(),
  ...badgeTemplates(),
})

/**
 * Registrations run one after another, so the last change is what the relay
 * keeps.
 */
let registration: Promise<void> = Promise.resolve()

/**
 * A registration that hangs (the APNs token can, and so can the FCM token
 * without Google Play services) stops holding up the next.
 */
const REGISTRATION_TIMEOUT_MS = 30 * 1000

function withTimeout(work: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Buddies push registration timed out')),
      REGISTRATION_TIMEOUT_MS
    )
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Registers this device for Buddies pushes once Buddies has started and the
 * system allows notifications. With Buddies notifications off here, it
 * registers no templates, so the relay sends this device nothing. An unchanged
 * registration is only re-sent once a day, so calling this often is cheap. Call
 * it again when buddies, join request mutes, or badge alerts change.
 */
export function registerBuddiesPush(): Promise<void> {
  const run = registration.then(() => withTimeout(register()))
  registration = run.catch(() => {
    // The caller sees the failure; the next registration still runs.
  })
  return run
}

async function register() {
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
    const outcome = await buddiesEngine.registerPush({
      ...(await pushAddress()),
      templates: notificationsEnabled ? buddiesPushTemplates() : {},
    })
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
