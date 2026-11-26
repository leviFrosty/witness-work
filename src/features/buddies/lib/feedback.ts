import { Platform } from 'react-native'
import * as Application from 'expo-application'
import * as Device from 'expo-device'
import { getLocales } from 'expo-localization'
import type { PostHog, Survey } from 'posthog-react-native'
import { toB64u } from '@/features/buddies/lib/bytes'
import { randomBytes } from '@/features/buddies/lib/random'
import type { BuddiesState } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export const BUDDIES_FEEDBACK_SURVEY_ID = '01a0f037-23cd-0000-e818-63a4821064d8'

export function createFeedbackId(): string {
  return toB64u(randomBytes(16))
}

export function deviceMetadata() {
  return {
    platform: Platform.OS,
    os_name: Device.osName,
    os_version: Device.osVersion,
    device_model: Device.modelName,
    device_type: Device.deviceType,
    app_version: Application.nativeApplicationVersion,
    app_build: Application.nativeBuildVersion,
    locale: getLocales()[0]?.languageTag,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

export function buddiesDiagnostics(state: BuddiesState) {
  return {
    buddies_onboarding_complete: state.onboardingComplete,
    buddies_inbox_registered: state.registeredInboxId !== null,
    buddies_sync_seq: state.syncSeq,
    buddies_last_sync_at: state.lastSyncAt
      ? new Date(state.lastSyncAt).toISOString()
      : null,
    buddies_count: state.buddies.length,
    buddies_outgoing_invites: state.outgoingInvites.length,
    buddies_incoming_claims: state.incomingClaims.length,
    buddies_pending_removals: state.pendingRemovals.length,
    buddies_slots_need_restore: state.slotsNeedRestore,
    buddies_cards: Object.keys(state.cards).length,
    buddies_outgoing_shares: Object.keys(state.outgoingShares).length,
    buddies_incoming_shares: Object.keys(state.incomingShares).length,
    buddies_notifications: state.notifications.length,
    buddies_push_registered: state.pushRegistrationKey !== null,
    buddies_notifications_enabled: state.notificationsEnabled,
  }
}

export async function sendFeedbackAttachments(
  client: PostHog,
  survey: Survey,
  feedbackId: string
) {
  client.capture('survey attachment', {
    $survey_id: survey.id,
    $survey_name: survey.name,
    feedback_id: feedbackId,
    kind: 'diagnostics',
    ...deviceMetadata(),
    ...buddiesDiagnostics(useBuddies.getState()),
  })
  await client.flush()
}
