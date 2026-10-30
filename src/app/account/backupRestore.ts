import { Alert } from 'react-native'
import { accountKey, accountKeyAvailable } from '@/app/account/accountKey'
import { enableBackup } from '@/app/account/backup'
import { backupTurnOnFailure } from '@/app/account/backupCopy'
import {
  combineLocalWithBackup,
  foldBackupPayloads,
  payloadCounts,
  previewCombine,
  readBackupPayload,
  replaceLocalWithBackup,
} from '@/app/account/backupData'
import { hasMeaningfulLocalData } from '@/app/sync/iCloudSync'
import { usesCloudSync } from '@/lib/syncTransport/provider'
import { usePreferences } from '@/stores/preferences'
import { cloudSyncNewestSlotAt } from '@/app/sync/cloudSync'
import type { SyncPayload } from '@/app/sync/payload'
import { analytics } from '@/lib/analytics'
import { formatDateTime } from '@/lib/dates'
import { HttpError } from '@/lib/http/request'
import i18n, { type TranslationKey } from '@/lib/locales'
import { logger } from '@/lib/logger'
import {
  type BackupAccess,
  withBackupAccess,
} from '@/lib/serverAccount/backupAccess'
import {
  type BackupSlot,
  getBackup,
  listBackups,
} from '@/lib/serverAccount/backupClient'
import {
  BackupOpenError,
  type BackupPlaintext,
  deriveBackupKey,
  openBackup,
} from '@/lib/serverAccount/backupCrypto'
import { BackupError } from '@/lib/serverAccount/backupScheduler'
import { logBackup, useBackupState } from '@/lib/serverAccount/backupStore'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

/**
 * Restoring the account backup (ADR 0026 §4): every slot is downloaded,
 * decrypted, validated as a sync payload, and folded with the sync merge.
 * Offered after a handoff, after a recovery key, once on a fresh install whose
 * account key came back with iCloud Keychain or Block Store, and from
 * Settings.
 */

export type RestoreSource =
  | 'handoff'
  | 'recovery_key'
  | 'fresh_install'
  | 'settings'
  | 'tools'

export type RestoreFailure =
  | 'offline'
  | 'unavailable'
  /** Every slot was from a newer app version. */
  | 'newer'
  /** No slot could be read. */
  | 'unreadable'
  | 'server'

/** One slot after downloading: its payload, or why it was skipped. */
export type DownloadedSlot = BackupSlot &
  (
    | {
        ok: true
        payload: SyncPayload
        deviceName: string
        platform: BackupPlaintext['platform']
        createdAt: number
      }
    | { ok: false; problem: 'newer' | 'unreadable' }
  )

export type RestoreOutcome =
  /** The account has no backup, or this device has no account key. */
  | { outcome: 'none' }
  | { outcome: 'skipped' }
  /**
   * Cloud Sync brings the account's data to this device instead (ADR 0030 §3),
   * so no restore is offered. `combine`: this device has records of its own, so
   * Cloud Sync asks how to combine them first.
   */
  | { outcome: 'synced'; combine: boolean }
  | {
      outcome: 'restored'
      mode: 'replace' | 'combine'
      slots: number
      skippedNewer: number
      skippedUnreadable: number
    }
  | { outcome: 'failed'; reason: RestoreFailure }

const failureFrom = (error: unknown): RestoreFailure => {
  if (error instanceof BackupError) {
    if (error.code === 'offline' || error.code === 'unavailable')
      return error.code
    return 'server'
  }
  return 'server'
}

/** Tools: the next download has one byte flipped, as a corrupt slot would. */
let corruptNextDownload = false
export function simulateCorruptDownload() {
  corruptNextDownload = true
}

/** Decrypts and validates one downloaded blob. */
export function readSlotBlob(
  access: Pick<BackupAccess, 'accountKey' | 'accountId' | 'olderBackupKeys'>,
  slot: BackupSlot,
  blob: Uint8Array
): DownloadedSlot {
  try {
    const plaintext = openBackup(
      deriveBackupKey(access.accountKey),
      blob,
      { accountId: access.accountId, slotId: slot.slotId },
      access.olderBackupKeys
    )
    const read = readBackupPayload(plaintext, slot.uploadedAt)
    if (!read.ok) return { ...slot, ok: false, problem: read.problem }
    return {
      ...slot,
      ok: true,
      payload: read.payload,
      deviceName: plaintext.deviceName,
      platform: plaintext.platform,
      createdAt: plaintext.createdAt,
    }
  } catch (error) {
    return {
      ...slot,
      ok: false,
      problem:
        error instanceof BackupOpenError && error.problem === 'newer'
          ? 'newer'
          : 'unreadable',
    }
  }
}

/**
 * Downloads and reads `slots` (every slot of the account without it). A slot
 * deleted meanwhile is left out; a failed download fails the whole restore.
 */
export async function downloadBackups(
  access: BackupAccess,
  slots?: BackupSlot[]
): Promise<DownloadedSlot[]> {
  const listed = slots ?? (await listBackups(access.options))
  const results: DownloadedSlot[] = []
  for (const slot of listed) {
    let blob: Uint8Array
    try {
      blob = await getBackup(access.options, slot.slotId)
    } catch (error) {
      if (error instanceof HttpError && error.serverCode === 'not_found')
        continue
      throw error
    }
    if (corruptNextDownload && blob.length > 0) {
      corruptNextDownload = false
      blob = blob.slice()
      blob[blob.length - 1] ^= 0xff
      logBackup('warn', 'simulated a corrupt download')
    }
    results.push(readSlotBlob(access, slot, blob))
  }
  return results
}

/** Runs `op` as this device's account; null without an account key. */
async function asAccount<T>(
  op: (access: BackupAccess) => Promise<T>
): Promise<T | null> {
  if (!accountKeyAvailable()) return null
  const key = await accountKey.peek()
  if (!key) return null
  return withBackupAccess(key, op)
}

/** Applies a choice to downloaded slots. */
export function applyRestore(
  downloaded: DownloadedSlot[],
  mode: 'replace' | 'combine'
): Extract<RestoreOutcome, { outcome: 'restored' }> {
  const payloads = downloaded.flatMap((slot) => (slot.ok ? [slot.payload] : []))
  if (mode === 'replace') {
    const folded = foldBackupPayloads(payloads)
    if (folded) replaceLocalWithBackup(folded)
  } else combineLocalWithBackup(payloads)
  return {
    outcome: 'restored',
    mode,
    slots: payloads.length,
    skippedNewer: downloaded.filter(
      (slot) => !slot.ok && slot.problem === 'newer'
    ).length,
    skippedUnreadable: downloaded.filter(
      (slot) => !slot.ok && slot.problem === 'unreadable'
    ).length,
  }
}

type Choice = 'replace' | 'combine' | 'skip'

const ask = (
  title: string,
  message: string,
  buttons: {
    text: string
    choice: Choice
    style?: 'cancel' | 'destructive' | 'default'
  }[]
) =>
  new Promise<Choice>((resolve) =>
    Alert.alert(
      title,
      message,
      buttons.map(({ text, choice, style }) => ({
        text,
        style,
        onPress: () => resolve(choice),
      })),
      { cancelable: true, onDismiss: () => resolve('skip') }
    )
  )

/** Asks whether to restore, and how when this phone already has records. */
function askToRestore(
  slots: BackupSlot[],
  localData: boolean
): Promise<Choice> {
  const newest = Math.max(...slots.map((slot) => slot.uploadedAt))
  const when = formatDateTime(newest, { style: 'medium' })
  const found =
    slots.length > 1
      ? i18n.t('backup_restoreFoundDevices', { count: slots.length, when })
      : i18n.t('backup_restoreFound', { when })
  if (!localData)
    return ask(
      i18n.t('backup_restoreTitle'),
      `${found} ${i18n.t('backup_restoreAsk')}`,
      [
        { text: i18n.t('notNow'), choice: 'skip', style: 'cancel' },
        { text: i18n.t('backup_restoreAction'), choice: 'replace' },
      ]
    )
  return ask(
    i18n.t('backup_restoreTitle'),
    `${found} ${i18n.t('backup_restoreChoice')}`,
    [
      { text: i18n.t('notNow'), choice: 'skip', style: 'cancel' },
      { text: i18n.t('backup_restoreCombine'), choice: 'combine' },
      {
        text: i18n.t('backup_restoreReplace'),
        choice: 'replace',
        style: 'destructive',
      },
    ]
  )
}

const FAILURE_COPY: Record<RestoreFailure, TranslationKey> = {
  offline: 'backup_restoreFailedOffline',
  unavailable: 'backup_restoreFailedUnavailable',
  newer: 'backup_restoreFailedNewer',
  unreadable: 'backup_restoreFailedUnreadable',
  server: 'backup_restoreFailedServer',
}

function showFailure(reason: RestoreFailure) {
  Alert.alert(i18n.t('backup_restoreFailedTitle'), i18n.t(FAILURE_COPY[reason]))
}

/** Says it's done, what was skipped, and offers backup here when it's off. */
function showRestored(
  result: Extract<RestoreOutcome, { outcome: 'restored' }>
) {
  const lines = [i18n.t('backup_restoredBody')]
  if (result.skippedNewer > 0) lines.push(i18n.t('backup_restoredSkippedNewer'))
  if (result.skippedUnreadable > 0)
    lines.push(i18n.t('backup_restoredSkippedUnreadable'))
  const backupOff = !useBackupState.getState().enabled
  if (backupOff) lines.push(i18n.t('backup_restoredTurnOn'))
  Alert.alert(
    i18n.t('backup_restoredTitle'),
    lines.join('\n\n'),
    backupOff
      ? [
          { text: i18n.t('notNow'), style: 'cancel' },
          {
            text: i18n.t('backup_turnOn'),
            onPress: () =>
              void enableBackup('restore').then((result) => {
                if (!result.ok)
                  Alert.alert(
                    i18n.t('backup_turnOnFailedTitle'),
                    i18n.t(backupTurnOnFailure(result.code))
                  )
              }),
          },
        ]
      : [{ text: i18n.t('ok') }]
  )
}

/** Remembers that this account's restore was offered on this install. */
const markOffered = (key: Uint8Array) =>
  useBackupState.setState({
    restoreOfferedFor: deriveAccountSigningKey(key).publicKey,
  })

let restoring: Promise<RestoreOutcome> | null = null

/**
 * How much later than another device's Cloud Sync slot the newest backup may be
 * and still hold nothing newer. A device on both writes its slot about 5
 * seconds after an edit and its backup 30 seconds after the edits stop (at most
 * 5 minutes into a steady stream), and both times are the server's, so there's
 * no device clock to skew them.
 */
export const SYNC_COVERS_BACKUP_GRACE_MS = 10 * 60_000

/**
 * Whether Cloud Sync, whose newest slot from another device was written at
 * `newestSyncAt`, is at least as current as the account's backups. A backup
 * clearly newer (a phone that stayed on iCloud while a rarely used iPad or a
 * retired phone left a stale slot) holds records Cloud Sync never had, so the
 * restore is offered instead.
 */
export const syncCoversBackups = (newestSyncAt: number, slots: BackupSlot[]) =>
  slots.every(
    (slot) => slot.uploadedAt <= newestSyncAt + SYNC_COVERS_BACKUP_GRACE_MS
  )

/**
 * Offers to restore the account's backup onto this device: lists the slots,
 * asks (Restore or Not Now with no records here; Replace, Combine or Not Now
 * otherwise), downloads and applies them, then offers to turn backup on here.
 * Resolves what happened; alerts say so on the way. With `quietWhenNone`, an
 * account without a backup (or one the server can't be asked about) says
 * nothing.
 */
export function offerRestore(
  source: RestoreSource,
  { quietWhenNone = true }: { quietWhenNone?: boolean } = {}
): Promise<RestoreOutcome> {
  restoring ??= runRestore(source, quietWhenNone).finally(() => {
    restoring = null
    useBackupState.setState({ restoring: false })
  })
  return restoring
}

async function runRestore(
  source: RestoreSource,
  quietWhenNone: boolean
): Promise<RestoreOutcome> {
  const fail = (reason: RestoreFailure, quiet = false): RestoreOutcome => {
    analytics.capture('account_restore_failed', { reason, source })
    logBackup('warn', `restore failed (${reason})`)
    if (!quiet) showFailure(reason)
    return { outcome: 'failed', reason }
  }
  // A new phone on Cloud Sync gets everything streamed down; asking to
  // restore a backup as well would only duplicate that, unless the backup is
  // newer than every other device's slot. Settings and the Tools still offer
  // it. When the backups can't be listed, Cloud Sync still brings what it has.
  const syncedAt =
    source === 'handoff' ||
    source === 'recovery_key' ||
    source === 'fresh_install'
      ? cloudSyncNewestSlotAt()
      : Promise.resolve(null)
  const listing = asAccount(async (access) => ({
    access,
    slots: await listBackups(access.options),
  })).then(
    (listed) => ({ ok: true as const, listed }),
    (error: unknown) => ({ ok: false as const, error })
  )
  const [newestSync, listedBackups] = await Promise.all([syncedAt, listing])
  if (
    newestSync !== null &&
    (!listedBackups.ok ||
      syncCoversBackups(newestSync, listedBackups.listed?.slots ?? []))
  ) {
    // Cloud Sync's default may already have pulled the account's records in;
    // a choice is pending only when it found records of this device's own.
    const prefs = usePreferences.getState()
    const combine =
      prefs.iCloudSyncNeedsResolution ||
      (!(prefs.iCloudSyncEnabled && usesCloudSync()) &&
        hasMeaningfulLocalData())
    analytics.capture('account_restore_offered', {
      source,
      slots: 0,
      local_data: combine,
      cloud_sync: true,
    })
    return { outcome: 'synced', combine }
  }
  if (!listedBackups.ok) {
    logger.warn('[backup] listing for a restore failed', listedBackups.error)
    return fail(failureFrom(listedBackups.error), quietWhenNone)
  }
  const { listed } = listedBackups
  if (!listed || listed.slots.length === 0) {
    if (listed) markOffered(listed.access.accountKey)
    return { outcome: 'none' }
  }
  const { access, slots } = listed
  const localData = hasMeaningfulLocalData()
  analytics.capture('account_restore_offered', {
    source,
    slots: slots.length,
    local_data: localData,
    cloud_sync_older: newestSync !== null,
  })
  markOffered(access.accountKey)
  const choice = await askToRestore(slots, localData)
  analytics.capture('account_restore_chosen', { choice, source })
  if (choice === 'skip') return { outcome: 'skipped' }

  useBackupState.setState({ restoring: true })
  let downloaded: DownloadedSlot[]
  try {
    downloaded = await withBackupAccess(access.accountKey, (current) =>
      downloadBackups(current, slots)
    )
  } catch (error) {
    logger.warn('[backup] downloading for a restore failed', error)
    return fail(failureFrom(error))
  }
  if (!downloaded.some((slot) => slot.ok)) {
    const newer = downloaded.some(
      (slot) => !slot.ok && slot.problem === 'newer'
    )
    return fail(
      downloaded.length === 0 ? 'unreadable' : newer ? 'newer' : 'unreadable'
    )
  }
  const result = applyRestore(downloaded, choice)
  analytics.capture('account_restore_completed', {
    mode: result.mode,
    slots: result.slots,
    skipped: result.skippedNewer + result.skippedUnreadable,
    source,
  })
  logBackup(
    'info',
    `restored ${result.slots} slot(s) (${result.mode}), skipped ${result.skippedNewer} newer and ${result.skippedUnreadable} unreadable`
  )
  showRestored(result)
  return result
}

/**
 * The fresh-install offer: once per account, after onboarding, when the account
 * key is already here (iCloud Keychain or Block Store brought it back) and this
 * device has no records of its own. Says nothing when there's no backup or the
 * server can't be reached (it asks again next launch).
 */
export async function offerRestoreOnFreshInstall(): Promise<void> {
  if (!accountKeyAvailable() || useBackupState.getState().enabled) return
  if (hasMeaningfulLocalData()) return
  const key = await accountKey.peek()
  if (!key) return
  if (
    useBackupState.getState().restoreOfferedFor ===
    deriveAccountSigningKey(key).publicKey
  )
    return
  await offerRestore('fresh_install')
}

/** What Tools and the verify harness see of the account's backup. */
export type BackupInspection = {
  accountId: string
  slots: DownloadedSlot[]
}

/**
 * Downloads and decrypts the account's slots (or just `slotIds`) without
 * applying anything. Null without an account key.
 */
export function inspectBackups(
  slotIds?: string[]
): Promise<BackupInspection | null> {
  return asAccount(async (access) => {
    const listed = await listBackups(access.options)
    return {
      accountId: access.accountId,
      slots: await downloadBackups(
        access,
        slotIds
          ? listed.filter((slot) => slotIds.includes(slot.slotId))
          : listed
      ),
    }
  })
}

/**
 * The restore dry run: what Replace would leave on this device and what Combine
 * would change, as record counts. Writes nothing.
 */
export function dryRunRestore(slots: DownloadedSlot[]) {
  const payloads = slots.flatMap((slot) => (slot.ok ? [slot.payload] : []))
  const folded = foldBackupPayloads(payloads)
  return {
    readable: payloads.length,
    skipped: slots
      .filter((slot) => !slot.ok)
      .map((slot) => ({
        slotId: slot.slotId,
        problem: slot.ok ? null : slot.problem,
      })),
    replace: folded ? payloadCounts(folded) : null,
    combine: previewCombine(payloads),
  }
}
