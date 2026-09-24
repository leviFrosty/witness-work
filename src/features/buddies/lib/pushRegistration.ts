import * as Application from 'expo-application'
import * as Notifications from 'expo-notifications'
import i18n from '@/lib/locales'
import type { BuddyPushKind } from '@/features/buddies/lib/engine'
import type { PushTemplate } from '@/features/buddies/lib/relay'
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
 * Registers this device for Buddies pushes once Buddies has started and iOS
 * allows notifications. With Buddies notifications off here, it registers no
 * templates, so the relay sends this device nothing.
 */
export async function registerBuddiesPush() {
  const { registeredInboxId, notificationsEnabled } = useBuddies.getState()
  if (registeredInboxId === null) return
  const permission = await Notifications.getPermissionsAsync()
  if (!permission.granted) return
  const token = await Notifications.getDevicePushTokenAsync()
  const environment =
    await Application.getIosPushNotificationServiceEnvironmentAsync()
  await buddiesEngine.registerPush({
    apnsToken: String(token.data),
    // Dev-client and simulator builds talk to the APNs sandbox.
    apnsEnvironment: environment === 'production' ? 'production' : 'sandbox',
    templates: notificationsEnabled ? pushTemplates() : {},
  })
}
