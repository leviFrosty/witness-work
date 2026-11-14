import { onCloudSyncStatus } from '@/app/sync/cloudSync'
import { withSyncOptionLock } from '@/app/sync/syncOptionLock'
import {
  currentSyncOption,
  republishSnapshot,
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

export type CloudSyncRequestFailure = SwitchFailure | 'failed' | 'chose_other'

export type CloudSyncRequestAnswer =
  | { outcome: 'switched' | 'already_on' }
  | { outcome: 'failed'; reason: CloudSyncRequestFailure; final: boolean }
  | { outcome: 'skipped' }

const SKIPPED: CloudSyncRequestAnswer = { outcome: 'skipped' }

let answering: Promise<CloudSyncRequestAnswer> | null = null

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

  if (!prefs.onboardingComplete) return SKIPPED
  if (useUpdateRequired.getState().required !== null) return SKIPPED
  if (!accountSessions.snapshot()) return SKIPPED

  const acted = () =>
    usePreferences.setState({ cloudSyncRequestAnswered: requestedAt })

  const from = await withSyncOptionLock(async () => currentSyncOption())
  if (from === 'cloud') {
    acted()
    void republishSnapshot('account_request').catch(() => undefined)
    analytics.capture('cloud_sync_request_answered', { outcome: 'already_on' })
    return { outcome: 'already_on' }
  }

  const fail = (reason: CloudSyncRequestFailure): CloudSyncRequestAnswer => {
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

let latest: SyncStatus | null = null

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
