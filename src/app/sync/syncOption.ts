import { endPhotoPasses } from '@/lib/syncTransport/photoEpoch'
import { earnPasskeyPrompt } from '@/app/account/passkeyPrompt'
import { bookkeepingForNewTransport } from '@/app/sync/imageSync'
import { iCloudSync } from '@/app/sync/iCloudSync'
import { clearPublishedPhotos } from '@/app/sync/photoBaseline'
import { withSyncOptionLock } from '@/app/sync/syncOptionLock'
import {
  deleteOwnCloudSyncSlot,
  prepareCloudSync,
  type PrepareCloudSyncOutcome,
} from '@/app/sync/cloudSync'
import { analytics } from '@/lib/analytics'
import { checkICloudIdentity } from '@/lib/iCloudIdentity'
import { logger } from '@/lib/logger'
import { syncTransport as platformSyncTransport } from '@/lib/syncTransport'
import { cloudSyncOnly } from '@/lib/syncTransport/platform'
import {
  cloudSyncOffered,
  syncProvider,
  type SyncProvider,
} from '@/lib/syncTransport/provider'
import { usePreferences } from '@/stores/preferences'

export type SyncOption = SyncProvider | 'off'

export const currentSyncOption = (): SyncOption =>
  usePreferences.getState().iCloudSyncEnabled ? syncProvider() : 'off'

const NAMESPACE_RESET = {
  iCloudSyncPendingPush: true,
  iCloudSyncIssue: null,
  iCloudSyncErrorCode: null,
  lastiCloudSyncAt: null,
  lastiCloudPushedAt: null,
  lastiCloudPulledAt: null,
  lastiCloudUploadedAt: null,
  iCloudUploadPendingSince: null,
  iCloudUploadIssue: null,
  lastiCloudRemoteWrittenAt: null,
  lastiCloudRemoteDeviceId: null,
  lastiCloudRemoteDeviceName: null,
  iCloudResetEpoch: null,
  iCloudResetAdoptedNotice: null,
  iCloudSyncDevices: {},
} as const

type RestoredKey =
  | keyof typeof NAMESPACE_RESET
  | 'iCloudImageSync'
  | 'syncProvider'
  | 'iCloudSyncEnabled'
  | 'iCloudSyncSetByUser'
  | 'iCloudSyncNeedsResolution'
  | 'cloudSyncOffer'

const RESTORED_KEYS: RestoredKey[] = [
  ...(Object.keys(NAMESPACE_RESET) as Array<keyof typeof NAMESPACE_RESET>),
  'iCloudImageSync',
  'syncProvider',
  'iCloudSyncEnabled',
  'iCloudSyncSetByUser',
  'iCloudSyncNeedsResolution',
  'cloudSyncOffer',
]

type Restorable = Pick<ReturnType<typeof usePreferences.getState>, RestoredKey>

const snapshot = (): Restorable => {
  const prefs = usePreferences.getState()
  return Object.fromEntries(
    RESTORED_KEYS.map((key) => [key, prefs[key]])
  ) as Restorable
}

export type SwitchFailure =
  | 'not_entitled'
  | 'disabled'
  | 'no_session'
  | 'unavailable'
  | 'incomplete'
  | 'offline'
  | 'account_changed'

export type SwitchOutcome =
  | {
      outcome: 'switched'

      pending: boolean
    }
  | { outcome: 'failed'; reason: SwitchFailure }

export type SwitchSource =
  | 'settings'
  | 'offer'
  | 'tray'
  | 'tools'
  | 'account_request'

const FLUSH_WAIT_MS = 15_000

const bounded = <T>(work: Promise<T>, ms: number) =>
  Promise.race([
    work,
    new Promise<undefined>((resolve) => setTimeout(resolve, ms)),
  ])

const prepareFailure = (
  prepared: Exclude<PrepareCloudSyncOutcome, { outcome: 'ready' }>
): SwitchFailure =>
  prepared.outcome === 'not_entitled'
    ? 'not_entitled'
    : prepared.outcome === 'disabled'
      ? 'disabled'
      : 'no_session'

let switching: Promise<SwitchOutcome> | null = null

export function switchSyncOption(
  to: SyncOption,
  source: SwitchSource
): Promise<SwitchOutcome> {
  switching ??= withSyncOptionLock(() => runSwitch(to, source)).finally(() => {
    switching = null
  })
  return switching
}

async function runSwitch(
  to: SyncOption,
  source: SwitchSource
): Promise<SwitchOutcome> {
  const from = currentSyncOption()
  if (from === to) return { outcome: 'switched', pending: false }
  const fail = (reason: SwitchFailure): SwitchOutcome => {
    analytics.capture('cloud_sync_switch_failed', { from, to, reason, source })
    logger.warn(`[syncOption] switch ${from} → ${to} failed: ${reason}`)
    return { outcome: 'failed', reason }
  }

  if (cloudSyncOnly() && to !== 'cloud') return fail('unavailable')
  if (to === 'cloud') {
    const prepared = await prepareCloudSync()
    if (prepared.outcome !== 'ready') return fail(prepareFailure(prepared))
  } else if (to === 'platform' && !platformSyncTransport().isAvailable()) {
    return fail('unavailable')
  }

  if (from !== 'off') {
    iCloudSync.resetPushBackoff()
    if (usePreferences.getState().iCloudSyncPendingPush)
      await bounded(iCloudSync.push('switch-flush'), FLUSH_WAIT_MS)
  }
  const previous = snapshot()
  usePreferences.setState({ iCloudSyncEnabled: false })

  endPhotoPasses()
  await iCloudSync.waitForSyncIdle()

  clearPublishedPhotos()
  if (from === 'cloud') {
    await deleteOwnCloudSyncSlot()

    usePreferences.setState({ cloudSyncAccountToken: null })
  }

  if (to === 'off') {
    usePreferences.setState({ iCloudSyncSetByUser: true })
    analytics.capture('cloud_sync_option_changed', { from, to, source })
    analytics.capture('icloud_sync_enabled_changed', {
      enabled: false,
      source: 'settings',
    })
    return { outcome: 'switched', pending: false }
  }

  usePreferences.setState({
    ...NAMESPACE_RESET,
    iCloudImageSync: bookkeepingForNewTransport(
      usePreferences.getState().iCloudImageSync ?? {}
    ),
    syncProvider: to,
    iCloudSyncSetByUser: true,
    iCloudSyncNeedsResolution: false,
    iCloudAccountChangedAt: null,

    cloudSyncOffer: 'dismissed',

    ...(to === 'cloud' && { cloudSyncAccountToken: null }),
  })
  const restore = (pendingPush = false) =>
    usePreferences.setState({
      ...previous,
      ...(pendingPush && { iCloudSyncPendingPush: true }),
    })

  if (!checkICloudIdentity('initial_enable')) {
    restore(from === 'cloud')
    return fail('account_changed')
  }

  const peek = await iCloudSync.peekRemotePayload()
  if (peek.status !== 'found' && peek.status !== 'none') {
    restore(from === 'cloud')
    return fail(
      peek.status === 'incomplete'
        ? 'incomplete'
        : peek.status === 'offline'
          ? 'offline'
          : 'unavailable'
    )
  }
  iCloudSync.backfillUpdatedAtIfNeeded()
  if (peek.status === 'found') iCloudSync.joinRemoteResetEpoch(peek.remote)
  usePreferences.setState({ iCloudSyncEnabled: true, iCloudFreshSetup: false })
  if (peek.status === 'found') await iCloudSync.pullAndMerge('switch')
  const pushed = await iCloudSync.push('switch')

  if (to === 'cloud') {
    usePreferences.setState({ cloudSyncTrayOffer: 'answered' })

    earnPasskeyPrompt('cloud_sync')
  }
  analytics.capture('cloud_sync_option_changed', { from, to, source })
  if (from === 'off')
    analytics.capture('icloud_sync_enabled_changed', {
      enabled: true,
      source: source === 'tray' ? 'tray' : 'settings',
    })
  return { outcome: 'switched', pending: !pushed }
}

export function settleSyncProvider(): void {
  const prefs = usePreferences.getState()
  if (!prefs.iCloudSyncEnabled || prefs.syncProvider === 'cloud') return
  if (prefs.syncProvider === 'platform' && prefs.cloudSyncOffer !== null) return
  usePreferences.setState({
    syncProvider: 'platform',
    cloudSyncOffer: prefs.cloudSyncOffer ?? 'pending',
  })
}

export const showsCloudSyncOffer = (state = usePreferences.getState()) =>
  state.cloudSyncOffer === 'pending' &&
  state.iCloudSyncEnabled &&
  state.syncProvider === 'platform' &&
  cloudSyncOffered()

export function dismissCloudSyncOffer(): void {
  if (usePreferences.getState().cloudSyncOffer !== 'pending') return
  usePreferences.setState({ cloudSyncOffer: 'dismissed' })
  analytics.capture('cloud_sync_offer_answered', { choice: 'dismiss' })
}
