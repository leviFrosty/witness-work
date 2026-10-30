import { bookkeepingForNewTransport } from '@/app/sync/imageSync'
import { iCloudSync } from '@/app/sync/iCloudSync'
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
import {
  cloudSyncOffered,
  syncProvider,
  type SyncProvider,
} from '@/lib/syncTransport/provider'
import { usePreferences } from '@/stores/preferences'

/**
 * The User's sync option (ADR 0030): Cloud Sync, iCloud/Google Drive
 * (`platform`), or off. One at a time; switching moves this device's data to
 * the new option without losing any, and never touches other devices' data.
 */
export type SyncOption = SyncProvider | 'off'

export const currentSyncOption = (): SyncOption =>
  usePreferences.getState().iCloudSyncEnabled ? syncProvider() : 'off'

/**
 * Bookkeeping that belongs to one transport's namespace: its reset generation,
 * the devices seen in it, the last remote write, upload status. A switch starts
 * the new namespace fresh, then joins its newest generation when it reads it.
 * Photo bookkeeping keeps what it knows of this device's files and drops what
 * it saw of the old cloud (`bookkeepingForNewTransport`): each photo is checked
 * against the new one's listing, and a failure there (a full account) doesn't
 * show on the new one.
 */
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

/** The keys a failed switch puts back. */
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
  /** Cloud Sync: the account isn't entitled (not a Supporter). */
  | 'not_entitled'
  /** Cloud Sync is turned off on the server for now. */
  | 'disabled'
  /** No account session: offline, accounts off, or the device can't attest. */
  | 'no_session'
  /** ICloud or Google Drive isn't set up on this device. */
  | 'unavailable'
  /** The new option's data couldn't be read in full; nothing changed. */
  | 'incomplete'
  | 'offline'
  /** The account behind the new option changed; turn it on again. */
  | 'account_changed'

export type SwitchOutcome =
  | {
      outcome: 'switched'
      /** This device's data is still waiting to upload; sync retries it. */
      pending: boolean
    }
  | { outcome: 'failed'; reason: SwitchFailure }

export type SwitchSource =
  | 'settings'
  | 'offer'
  | 'tools'
  /** The account's Cloud Sync request, set by a browser (`cloudSyncRequest`). */
  | 'account_request'

/** Longest a switch waits to send the old option this device's last edits. */
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

/**
 * Moves this device to `to`. One switch at a time; a second call joins it, and
 * a switch waits for Cloud Sync's default to finish deciding
 * (`withSyncOptionLock`).
 *
 * 1. Gets the new option ready first (Cloud Sync's session and entitlement, or
 *    iCloud/Drive being available), so a switch that can't happen changes
 *    nothing.
 * 2. Sends the old option this device's pending edits (bounded), so devices still
 *    on it get them.
 * 3. Stops sync and waits for the running push and pull. Leaving Cloud Sync
 *    deletes this device's own slot; leaving iCloud/Drive leaves its file
 *    there, where it can't bring back anything deleted later (ADR 0030 §4).
 * 4. Points the engine at the new option with that namespace's bookkeeping fresh,
 *    reads its devices, joins their newest reset generation and merges ("Merge
 *    both": nothing is replaced), then pushes.
 */
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
  await iCloudSync.waitForSyncIdle()
  if (from === 'cloud') {
    await deleteOwnCloudSyncSlot()
    // Off Cloud Sync, the account it was on stops mattering: turning it on
    // again records whichever account this device has by then.
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
    // Choosing either way answers the one-time offer.
    cloudSyncOffer: 'dismissed',
    // The server account is recorded as it is now (ADR 0030 §4), not compared
    // with the one this device last synced with: a QR code or a recovery key
    // may have moved it to another while it was off Cloud Sync, and with no
    // slot or bookkeeping left there, that's no account change to stop for.
    ...(to === 'cloud' && { cloudSyncAccountToken: null }),
  })
  const restore = (pendingPush = false) =>
    usePreferences.setState({
      ...previous,
      ...(pendingPush && { iCloudSyncPendingPush: true }),
    })
  // Records the new option's account, or notices that iCloud's or Drive's
  // changed since this device last used it.
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
  analytics.capture('cloud_sync_option_changed', { from, to, source })
  if (from === 'off')
    analytics.capture('icloud_sync_enabled_changed', {
      enabled: true,
      source: 'settings',
    })
  return { outcome: 'switched', pending: !pushed }
}

/**
 * A device already syncing through iCloud or Drive when Cloud Sync arrived (its
 * User turned it on, or the Supporter default did) keeps it, and is offered the
 * switch once (ADR 0030 §3). Runs at launch and whenever sync turns on without
 * a recorded option.
 */
export function settleSyncProvider(): void {
  const prefs = usePreferences.getState()
  if (!prefs.iCloudSyncEnabled || prefs.syncProvider === 'cloud') return
  if (prefs.syncProvider === 'platform' && prefs.cloudSyncOffer !== null) return
  usePreferences.setState({
    syncProvider: 'platform',
    cloudSyncOffer: prefs.cloudSyncOffer ?? 'pending',
  })
}

/** Whether Settings should show the one-time offer to move to Cloud Sync. */
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
