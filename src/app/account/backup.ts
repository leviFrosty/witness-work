import { AppState, Platform } from 'react-native'
import { earnPasskeyPrompt } from '@/app/account/passkeyPrompt'
import { getRandomBytes } from 'expo-crypto'
import * as Device from 'expo-device'
import { accountKey, accountKeyAvailable } from '@/app/account/accountKey'
import {
  backupPlaintextHash,
  buildBackupPlaintext,
} from '@/app/account/backupData'
import { subscribeToLocalDataChanges } from '@/app/sync/localChanges'
import { analytics } from '@/lib/analytics'
import {
  addBackgroundListener,
  addForegroundListener,
} from '@/lib/appLifecycle'
import { addReconnectListener } from '@/lib/http/online'
import {
  type BackupAccess,
  backupAccessFor,
  backupErrorFrom,
  withBackupAccess,
} from '@/lib/serverAccount/backupAccess'
import {
  BACKUP_LIMITS,
  type BackupSlot,
  deleteBackup,
  listBackups,
  putBackup,
} from '@/lib/serverAccount/backupClient'
import { deriveBackupKey, sealBackup } from '@/lib/serverAccount/backupCrypto'
import {
  BackupError,
  type BackupFailure,
  type BackupRunOutcome,
  createBackupScheduler,
  EMPTY_BACKUP_SCHEDULE,
} from '@/lib/serverAccount/backupScheduler'
import {
  backupSchedule,
  ensureBackupSlotId,
  logBackup,
  useBackupState,
} from '@/lib/serverAccount/backupStore'

/**
 * The end-to-end encrypted backup kept by ww-api (ADR 0026 §4) for this app:
 * opt-in, free, one slot per install. Uploads the sync payload (photos aren't
 * included) when data changes, when the app leaves the foreground with
 * something pending, and at least daily (`backupScheduler.ts`). Restoring is
 * `backupRestore.ts`.
 */

/** The name a restore shows for this device; only inside the ciphertext. */
const deviceName = () =>
  Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android')

const platform = () => (Platform.OS === 'android' ? 'android' : 'ios')

/** The account key, created when `create` (backup on); `BackupError` else. */
async function readAccountKey(create: boolean): Promise<Uint8Array | null> {
  if (!accountKeyAvailable()) throw new BackupError('key')
  try {
    return create ? await accountKey.getOrCreate() : await accountKey.peek()
  } catch (error) {
    throw new BackupError(
      'key',
      null,
      error instanceof Error ? error.message : undefined
    )
  }
}

/** Runs `op` as this device's account; null without an account key yet. */
async function asAccount<T>(
  op: (access: BackupAccess) => Promise<T>,
  { create = false }: { create?: boolean } = {}
): Promise<T | null> {
  const key = await readAccountKey(create)
  if (!key) return null
  return withBackupAccess(key, op)
}

/** A day's worth of failure events at most per reason (`analyticsFrequency`). */
const reportFailure = (code: BackupFailure) =>
  analytics.capture('account_backup_failed', { reason: code })

const scheduler = createBackupScheduler({
  now: Date.now,
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  isEnabled: () => useBackupState.getState().enabled,
  prepare: async () => {
    const key = await readAccountKey(true)
    const access = await backupAccessFor(key!)
    const slotId = ensureBackupSlotId()
    const address = { accountId: access.accountId, slotId }
    const plaintext = buildBackupPlaintext({
      deviceName: deviceName(),
      platform: platform(),
      now: Date.now(),
    })
    return {
      hash: await backupPlaintextHash(plaintext, address),
      upload: async () => {
        const blob = sealBackup(
          deriveBackupKey(access.accountKey),
          plaintext,
          address,
          getRandomBytes(24)
        )
        if (blob.length > BACKUP_LIMITS.bytes)
          throw new BackupError('too_large')
        const { uploadedAt } = await withBackupAccess(
          access.accountKey,
          (current) => {
            if (current.accountId !== access.accountId)
              // Registered again under a new id: the blob names the old one.
              throw new BackupError('server')
            return putBackup(current.options, slotId, blob)
          }
        )
        noteOwnSlot(access.accountId, { slotId, size: blob.length, uploadedAt })
        return { size: blob.length }
      },
    }
  },
  state: backupSchedule,
  hasServerCopy: async () => {
    const slotId = useBackupState.getState().slotId
    if (!slotId) return null
    const slots = await refreshBackupSlots({ report: false })
    return slots ? slots.some((slot) => slot.slotId === slotId) : null
  },
  log: logBackup,
  onFailure: reportFailure,
  onRunningChange: (uploading) => useBackupState.setState({ uploading }),
})

/** Keeps the listed slots current after this phone's own upload. */
function noteOwnSlot(accountId: string, own: BackupSlot) {
  const { slots, slotsAccountId } = useBackupState.getState()
  if (!slots || slotsAccountId !== accountId) return
  useBackupState.setState({
    slots: [...slots.filter((slot) => slot.slotId !== own.slotId), own],
  })
}

/** Uploads now (Back Up Now, Tools), past the debounce and any backoff. */
export function backUpNow(reason = 'manual'): Promise<BackupRunOutcome> {
  return scheduler.run(reason, { force: true })
}

/** When the next automatic attempt runs, and whether one is running. */
export const backupScheduler = scheduler

export type EnableBackupResult =
  | { ok: true; upload: BackupRunOutcome }
  | { ok: false; code: BackupFailure }

/**
 * Turns backup on: makes the account key if there's none, registers the
 * account, and uploads. Stays off when the account can't be reached.
 */
export async function enableBackup(
  source: 'settings' | 'restore'
): Promise<EnableBackupResult> {
  try {
    const key = await readAccountKey(true)
    await backupAccessFor(key!)
  } catch (error) {
    const { code } = backupErrorFrom(error)
    logBackup('warn', `turning on failed (${code})`)
    return { ok: false, code }
  }
  useBackupState.setState({ enabled: true })
  backupSchedule.set({ pending: true, retryAt: null, failures: 0 })
  analytics.capture('account_backup_changed', { enabled: true, source })
  logBackup('info', `turned on (${source})`)
  // A restore turns it back on for the User; only choosing it is a moment.
  if (source === 'settings') earnPasskeyPrompt('backup')
  const upload = await backUpNow('enabled')
  void refreshBackupSlots()
  return { ok: true, upload }
}

/**
 * Turns backup off on this device, deleting this device's slot first when
 * asked. Backup stays off even when the deletion fails; resolves whether it was
 * deleted.
 */
export async function disableBackup({
  deleteServerCopy,
}: {
  deleteServerCopy: boolean
}): Promise<{ deleted: boolean | null }> {
  useBackupState.setState({ enabled: false })
  scheduler.stop()
  backupSchedule.set({ pending: false })
  analytics.capture('account_backup_changed', {
    enabled: false,
    source: 'settings',
    deleted_server_copy: deleteServerCopy,
  })
  logBackup('info', 'turned off')
  if (!deleteServerCopy) return { deleted: null }
  const slotId = useBackupState.getState().slotId
  if (!slotId) return { deleted: true }
  try {
    await deleteBackupSlot(slotId, 'disable')
    return { deleted: true }
  } catch {
    return { deleted: false }
  }
}

/** Forgets what this device uploaded, so the next upload isn't skipped. */
function forgetUploads() {
  backupSchedule.set({
    lastHash: null,
    lastPutAt: null,
    lastSize: null,
    pending: useBackupState.getState().enabled,
  })
}

/** Bumped by each listing and deletion, so an older listing can't land last. */
let slotsVersion = 0

/**
 * The account's slots, listed again; null without an account key. Tells the
 * scheduler whether this device's slot is still there unless `report` is false
 * (its own check).
 */
export async function refreshBackupSlots({
  report = true,
}: { report?: boolean } = {}): Promise<BackupSlot[] | null> {
  const listedAt = Date.now()
  const listing = ++slotsVersion
  const listed = await asAccount(async (access) => ({
    accountId: access.accountId,
    slots: await listBackups(access.options),
  }))
  // A newer listing or a deletion since this one started has the newer list.
  const latest = listing === slotsVersion
  if (!listed) {
    if (latest) useBackupState.setState({ slots: [], slotsAccountId: null })
    return null
  }
  if (latest)
    useBackupState.setState({
      slots: listed.slots,
      slotsAccountId: listed.accountId,
      slotsListedAt: Date.now(),
    })
  const slotId = useBackupState.getState().slotId
  if (report && slotId)
    scheduler.serverCopyListed(
      listed.slots.some((slot) => slot.slotId === slotId),
      listedAt
    )
  return listed.slots
}

export type BackupDeleteSource = 'settings' | 'disable' | 'tools'

/**
 * Turns backup off on this device while a deletion runs, so no upload puts the
 * slot back. A deletion that fails (offline, say) turns it on again: nothing
 * was deleted, and the User didn't ask to stop backing up.
 */
async function deleteWithBackupOff(
  turnOff: boolean,
  source: BackupDeleteSource,
  run: () => Promise<unknown>
): Promise<void> {
  if (turnOff) {
    useBackupState.setState({ enabled: false })
    scheduler.stop()
  }
  try {
    await run()
  } catch (error) {
    if (turnOff) {
      useBackupState.setState({ enabled: true })
      scheduler.noteChange()
    }
    throw error
  }
  if (turnOff)
    analytics.capture('account_backup_changed', {
      enabled: false,
      source,
      deleted_server_copy: true,
    })
}

/**
 * Deletes one slot. Deleting this device's own slot also turns backup off here,
 * or the next upload would put it back.
 */
export async function deleteBackupSlot(
  slotId: string,
  source: BackupDeleteSource
): Promise<void> {
  const mine = slotId === useBackupState.getState().slotId
  await deleteWithBackupOff(
    mine && useBackupState.getState().enabled && source !== 'disable',
    source,
    () => asAccount((access) => deleteBackup(access.options, slotId))
  )
  if (mine) forgetUploads()
  analytics.capture('account_backup_deleted', { scope: 'slot', source })
  logBackup('info', `deleted ${mine ? 'this device’s' : 'another'} slot`)
  slotsVersion++
  useBackupState.setState((state) => ({
    slots: state.slots?.filter((slot) => slot.slotId !== slotId) ?? null,
  }))
}

/**
 * Delete Backup: every slot of the account, and backup off on this device.
 * Other devices with backup on upload again.
 */
export async function deleteAllBackups(
  source: BackupDeleteSource
): Promise<void> {
  await deleteWithBackupOff(useBackupState.getState().enabled, source, () =>
    asAccount((access) => deleteBackup(access.options))
  )
  forgetUploads()
  analytics.capture('account_backup_deleted', { scope: 'all', source })
  logBackup('info', 'deleted every slot')
  slotsVersion++
  useBackupState.setState({ slots: [] })
}

/** Tools: forget this install's slot, schedule and log. Backup turns off. */
export function resetBackupState() {
  scheduler.stop()
  useBackupState.setState({
    enabled: false,
    slotId: null,
    slotBinding: null,
    schedule: EMPTY_BACKUP_SCHEDULE,
    restoreOfferedFor: null,
    log: [],
    slots: null,
    slotsAccountId: null,
    slotsListedAt: null,
  })
}

/** Starts the backup's triggers; returns what stops them. */
export function installAccountBackup(): () => void {
  const unsubscribeData = subscribeToLocalDataChanges(() =>
    scheduler.noteChange()
  )
  const foreground = addForegroundListener(() => scheduler.onForeground())
  const background = addBackgroundListener(() => scheduler.onBackground())
  // `inactive` counts too: the iOS app switcher can end the app from there.
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'inactive') scheduler.onInactive()
  })
  const reconnect = addReconnectListener(() => scheduler.onReconnect())
  const nudged = useBackupState.subscribe((state, previous) => {
    if (state.nudge !== previous.nudge) scheduler.noteChange()
  })
  scheduler.onForeground()
  return () => {
    unsubscribeData()
    foreground.remove()
    background.remove()
    appState.remove()
    reconnect.remove()
    nudged()
    scheduler.stop()
  }
}
