import { onCloudSyncStatus } from '@/app/sync/cloudSync'
import { withSyncOptionLock } from '@/app/sync/syncOptionLock'
import {
  currentSyncOption,
  switchSyncOption,
  type SwitchFailure,
} from '@/app/sync/syncOption'
import { useSupporter } from '@/features/supporter/stores/supporter'
import { analytics } from '@/lib/analytics'
import { useUpdateRequired } from '@/lib/appUpdate/updateRequired'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { accountSessions } from '@/lib/serverAccount'
import type { SyncStatus } from '@/lib/syncTransport/server/syncClient'
import { usePreferences } from '@/stores/preferences'
import { toast } from '@/stores/toasts'

/**
 * The account's Cloud Sync request (ADR 0040 §5; docs/cloud-sync-photos.md,
 * "The Cloud Sync request"): a browser signed in to an account whose phones
 * aren't on Cloud Sync, and asked them to switch. The status read at launch and
 * on return to the foreground (`refreshCloudSyncStatus`) carries it; this
 * answers it. A phone not on Cloud Sync switches (`switchSyncOption`, so it
 * merges and loses nothing) and says so, even one whose sync the User turned
 * off: the request is the User's own, from a browser holding the account key.
 *
 * A phone acts once per request (`cloudSyncRequestAnswered`), so a User who
 * moves it back afterwards isn't overruled. It never clears the request: the
 * server does, once every live phone session has written a slot since, so one
 * phone switching doesn't strand another.
 */

export type CloudSyncRequestFailure =
  | SwitchFailure
  /** The switch threw. */
  | 'failed'
  /** The User moved this phone to another option while it switched. */
  | 'chose_other'

export type CloudSyncRequestAnswer =
  | { outcome: 'switched' | 'already_on' }
  | { outcome: 'failed'; reason: CloudSyncRequestFailure; final: boolean }
  /** Nothing to answer, or not now (onboarding, Update Required, …). */
  | { outcome: 'skipped' }

const SKIPPED: CloudSyncRequestAnswer = { outcome: 'skipped' }

let answering: Promise<CloudSyncRequestAnswer> | null = null

/** Answers `status`'s request, if it has one; one answer at a time. */
export function answerCloudSyncRequest(
  status: SyncStatus
): Promise<CloudSyncRequestAnswer> {
  if (answering) return Promise.resolve(SKIPPED)
  answering = answer(status).finally(() => {
    answering = null
  })
  return answering
}

async function answer(status: SyncStatus): Promise<CloudSyncRequestAnswer> {
  const { requestedAt } = status
  if (requestedAt === null) return SKIPPED
  const prefs = usePreferences.getState()
  if (prefs.cloudSyncRequestAnswered === requestedAt) return SKIPPED
  // Not during onboarding: a phone signing in there gets its account first.
  if (!prefs.onboardingComplete) return SKIPPED
  if (useUpdateRequired.getState().required !== null) return SKIPPED
  if (!accountSessions.snapshot()) return SKIPPED

  const acted = () =>
    usePreferences.setState({ cloudSyncRequestAnswered: requestedAt })
  // After any change already running (Cloud Sync's default, a switch in
  // Settings), so this answers the option it left.
  const from = await withSyncOptionLock(async () => currentSyncOption())
  if (from === 'cloud') {
    acted()
    analytics.capture('cloud_sync_request_answered', { outcome: 'already_on' })
    return { outcome: 'already_on' }
  }

  const fail = (reason: CloudSyncRequestFailure): CloudSyncRequestAnswer => {
    // Only the User's own choice ends it. The rest (offline, no session,
    // attestation pending, unreadable, not entitled yet) try again at the next
    // status read.
    const final = reason === 'chose_other'
    if (final) acted()
    analytics.capture('cloud_sync_request_answered', {
      outcome: 'failed',
      from,
      reason,
      final,
    })
    return { outcome: 'failed', reason, final }
  }
  // Cloud Sync is off on the server for now, or the account can't sync yet
  // (Supporters only, or ww-api couldn't check RevenueCat). A Supporter
  // whose purchase the server doesn't know yet still tries: the switch links it
  // first.
  if (
    !status.enabled ||
    (!status.entitled &&
      (status.supporterCheckFailed || !useSupporter.getState().isSupporter))
  )
    return SKIPPED

  let switched: Awaited<ReturnType<typeof switchSyncOption>>
  try {
    switched = await switchSyncOption('cloud', 'account_request')
  } catch (error) {
    logger.warn('[cloudSyncRequest] switch threw', error)
    return fail('failed')
  }
  if (switched.outcome === 'failed') return fail(switched.reason)
  // It joined a switch the User started elsewhere (Settings) meanwhile.
  if (currentSyncOption() !== 'cloud') return fail('chose_other')

  acted()
  toast.success(i18n.t('cloudSyncRequest_switchedTitle'), {
    message: i18n.t('cloudSyncRequest_switchedMessage'),
  })
  analytics.capture('cloud_sync_request_answered', {
    outcome: 'switched',
    from,
  })
  return { outcome: 'switched' }
}

/** The last status read with a request, for answering once a wait ends. */
let latest: SyncStatus | null = null

/**
 * Answers the request whenever a status read carries one, and again when what
 * held it back ends (onboarding finishes, Update Required lifts). No polling of
 * its own: the runtime reads the status at launch and on return to the
 * foreground. Returns an uninstall.
 */
export function installCloudSyncRequest(): () => void {
  const run = () => {
    if (latest) void answerCloudSyncRequest(latest)
  }
  const status = onCloudSyncStatus((next) => {
    latest = next.requestedAt === null ? null : next
    run()
  })
  const onboarding = usePreferences.subscribe((state, previous) => {
    if (state.onboardingComplete && !previous.onboardingComplete) run()
  })
  const gate = useUpdateRequired.subscribe((state, previous) => {
    if (state.required === null && previous.required !== null) run()
  })
  return () => {
    status()
    onboarding()
    gate()
    latest = null
  }
}
