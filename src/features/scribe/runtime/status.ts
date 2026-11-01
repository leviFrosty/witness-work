import type { AttestationSupport } from '@/lib/attestation/appAttest'
import { deviceAttestation } from '@/lib/attestation'
import { errorTracking } from '@/lib/errorTracking'
import { logger } from '@/lib/logger'
import { perf } from '@/lib/perf'
import { accountSessions, accountSuspended } from '@/lib/serverAccount'
import { relinkAfterSupporterRefusal } from '@/lib/serverAccount/revenueCatLinkRuntime'
import { scribeClient } from '@/features/scribe/lib/defaultClient'
import {
  REPORTED_SERVER_CODES,
  toScribeClientError,
  type ScribeClientError,
} from '@/features/scribe/lib/errors'
import {
  SCRIBE_STATUS_STALE_MS,
  SCRIBE_USAGE_MIN_INTERVAL_MS,
} from '@/features/scribe/constants'
import { noteGate, useScribeStatusStore } from '@/features/scribe/stores/status'
import { noteUsage, useScribeUsageStore } from '@/features/scribe/stores/usage'

let statusInFlight: Promise<void> | null = null

let statusCheckAgain = false

const hasAccountSession = async (): Promise<boolean> => {
  try {
    await accountSessions.ready()
    return accountSessions.snapshot() !== null
  } catch {
    return false
  }
}

export function refreshStatus({ force = false } = {}): Promise<void> {
  if (statusInFlight) {
    if (force) statusCheckAgain = true
    return statusInFlight
  }
  const { fetchedAt } = useScribeStatusStore.getState()
  if (!force && fetchedAt && Date.now() - fetchedAt < SCRIBE_STATUS_STALE_MS)
    return Promise.resolve()
  perf.count('scribe:status')
  const startedAt = Date.now()
  statusInFlight = scribeClient()
    .status()
    .then(
      (status) =>
        useScribeStatusStore.setState({
          status,
          fetchedAt: startedAt,
          failed: false,
        }),
      () => useScribeStatusStore.setState({ failed: true })
    )
    .then(refreshDeviceGate)
    .finally(() => {
      statusInFlight = null
      if (!statusCheckAgain) return
      statusCheckAgain = false
      void refreshStatus({ force: true })
    })
  return statusInFlight
}

let support: Promise<AttestationSupport> | null = null

export async function refreshDeviceGate(): Promise<void> {
  const pending = (support ??= deviceAttestation
    .checkSupport()
    .catch((): AttestationSupport => 'unknown'))
  const supported = await pending

  if (supported === 'unknown' && support === pending) support = null
  const suspended = await accountSuspended().catch(
    () => useScribeStatusStore.getState().gate.suspended
  )
  const failure = accountSessions.lastOpenFailure()
  noteGate({
    ineligible:
      failure?.attestation === 'device' || supported === 'unsupported',
    attestationUnavailable:
      failure?.failure === 'attestation' && failure.attestation !== 'device',
    suspended,
  })
}

export async function refreshUsage({
  force = false,
  open = true,
}: { force?: boolean; open?: boolean } = {}): Promise<void> {
  const usage = useScribeUsageStore.getState()
  if (usage.loading) return
  if (!force && Date.now() - usage.fetchedAt < SCRIBE_USAGE_MIN_INTERVAL_MS)
    return
  const { status, gate, devClient } = useScribeStatusStore.getState()
  if (status?.enabled === false) return
  if (!devClient && (gate.ineligible || gate.suspended || gate.updateRequired))
    return
  useScribeUsageStore.setState({ loading: true, fetchedAt: Date.now() })
  if (!open && !devClient && !(await hasAccountSession())) {
    useScribeUsageStore.setState({ loading: false })
    return
  }
  perf.count('scribe:usage')
  try {
    noteUsage(await scribeClient().usage())
    useScribeUsageStore.setState({ loading: false, failed: false })
  } catch (error) {
    useScribeUsageStore.setState({ loading: false, failed: true })
    noteScribeFailure(toScribeClientError(error))
  }
}

export function noteSupporterAnswer(supporter: boolean): void {
  const plan = useScribeUsageStore.getState().snapshot?.plan
  if (plan && (plan === 'supporter') !== supporter)
    void refreshUsage({ force: true, open: false })
}

export function refreshLimitedUsage(): void {
  if (useScribeUsageStore.getState().snapshot?.limited)
    void refreshUsage({ open: false })
}

export async function recheckSupporter(): Promise<boolean> {
  const supporter = await relinkAfterSupporterRefusal()
  await refreshUsage({ force: true })
  return supporter
}

export function noteScribeFailure(failure: ScribeClientError): void {
  switch (failure.code) {
    case 'update_required':
      noteGate({ updateRequired: true })
      break
    case 'suspended':
      noteGate({ suspended: true })
      break
    case 'device_ineligible':
      noteGate({ ineligible: true })
      break
    case 'attestation_unavailable':
      noteGate({ attestationUnavailable: true })
      break
    case 'disabled':
      void refreshStatus({ force: true })
      break
    case 'unavailable':
      if (failure.status === 503) void refreshStatus({ force: true })
      break
  }
  if (failure.serverCode && REPORTED_SERVER_CODES.has(failure.serverCode)) {
    logger.warn('[scribe] request refused', failure.serverCode)
    errorTracking.captureMessage(`scribe: ${failure.serverCode}`, {
      status: failure.status ?? null,
    })
  }
}
