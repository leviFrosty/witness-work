import { alignPayloadClock } from '@/app/sync/clockSkew'
import { foldRemotePayloads } from '@/app/sync/foldRemotePayloads'
import { replaceLocalWithRemote } from '@/app/sync/iCloudSync'
import {
  applyMergedState,
  type LocalMergeState,
  localMergeState,
  mergePayloadsInto,
} from '@/app/sync/mergeIntoLocal'
import {
  buildPayload,
  isNewerPayloadVersion,
  parsePayload,
  type SyncPayload,
} from '@/app/sync/payload'
import { toB64u, utf8 } from '@/lib/bytes'
import { ensureSyncDeviceId } from '@/lib/iCloudIdentity'
import { sha256Native } from '@/lib/sha256'
import {
  type BackupAddress,
  type BackupPlaintext,
  type BackupPlatform,
  BACKUP_PLAINTEXT_VERSION,
} from '@/lib/serverAccount/backupCrypto'
import { usePreferences } from '@/stores/preferences'

/**
 * The account backup's data (ADR 0026 §4) is the sync payload: `buildPayload`
 * makes it, `parsePayload` validates it (and applies its migrations), and the
 * sync merge folds and applies it. Nothing here forks those.
 *
 * Two things differ from iCloud and Google Drive sync:
 *
 * - **Reset generations stay out.** `resetEpoch` belongs to one cloud's sync
 *   history. A backup leaves it out, and a restore ignores it: folding slots
 *   from devices with different sync histories would otherwise drop every slot
 *   but the newest generation's, and adopting one would make this device's own
 *   sync ignore its cloud's files, or replace the restore with them.
 * - **Sync's own bookkeeping stays this device's.** A restore keeps this device's
 *   reset generation and its "last pulled" and remote-device fields, so its
 *   sync's next pull merges the restored data with its cloud, as it would any
 *   edit.
 */

/** The plaintext for this device's slot: the sync payload and who wrote it. */
export function buildBackupPlaintext({
  deviceName,
  platform,
  now,
}: {
  deviceName: string
  platform: BackupPlatform
  now: number
}): BackupPlaintext {
  const { resetEpoch: _resetEpoch, ...payload } = buildPayload({
    deviceId: ensureSyncDeviceId(),
    deviceName,
  })
  return {
    v: BACKUP_PLAINTEXT_VERSION,
    deviceName,
    platform,
    createdAt: now,
    payload,
  }
}

/**
 * Identifies a plaintext's contents without its timestamps, so an unchanged
 * snapshot isn't uploaded again. Includes where it goes: a new account or slot
 * uploads even when the data is the same.
 */
export async function backupPlaintextHash(
  plaintext: BackupPlaintext,
  address: BackupAddress
): Promise<string> {
  const payload = plaintext.payload as SyncPayload
  return toB64u(
    await sha256Native(
      utf8(
        JSON.stringify({
          address,
          deviceName: plaintext.deviceName,
          payload: { ...payload, writtenAt: 0 },
        })
      )
    )
  )
}

/** A slot's payload once read, or why it can't be used. */
export type ReadBackupPayload =
  | { ok: true; payload: SyncPayload }
  | { ok: false; problem: 'newer' | 'unreadable' }

/**
 * Validates an opened slot's payload as a sync pull validates a peer's file,
 * anchoring an uncalibrated writer's stamps to the server's upload time the way
 * a pull anchors them to the file's date.
 */
export function readBackupPayload(
  plaintext: BackupPlaintext,
  uploadedAt: number
): ReadBackupPayload {
  const json = JSON.stringify(plaintext.payload)
  if (isNewerPayloadVersion(json)) return { ok: false, problem: 'newer' }
  const parsed = parsePayload(json)
  if (!parsed) return { ok: false, problem: 'unreadable' }
  const { resetEpoch: _resetEpoch, ...payload } = parsed
  return { ok: true, payload: alignPayloadClock(payload, uploadedAt) }
}

/** Every slot's payload folded into one, as a sync restore folds peers. */
export function foldBackupPayloads(
  payloads: SyncPayload[]
): SyncPayload | null {
  return foldRemotePayloads(
    payloads.map(({ resetEpoch: _resetEpoch, ...payload }) => payload)
  )
}

/** The preferences a restore mustn't take from the backup. */
const SYNC_BOOKKEEPING = [
  'iCloudResetEpoch',
  'lastiCloudSyncAt',
  'lastiCloudPulledAt',
  'lastiCloudRemoteWrittenAt',
  'lastiCloudRemoteDeviceId',
  'lastiCloudRemoteDeviceName',
] as const

/**
 * Replace: this device's records become the backup's, through the same
 * `replaceLocalWithRemote` an iCloud or Google Drive restore uses, keeping this
 * device's sync bookkeeping.
 */
export function replaceLocalWithBackup(folded: SyncPayload): void {
  const prefs = usePreferences.getState()
  const kept = Object.fromEntries(
    SYNC_BOOKKEEPING.map((key) => [key, prefs[key]])
  )
  replaceLocalWithRemote(folded)
  usePreferences.setState(kept)
}

/**
 * Combine: merges every slot into this device's records with the sync merge, as
 * a pull merges peers. Resolves whether anything changed.
 */
export function combineLocalWithBackup(payloads: SyncPayload[]): boolean {
  const { changed, merged } = mergePayloadsInto(localMergeState(), payloads)
  if (changed) applyMergedState(merged)
  return changed
}

/** Record counts, for Tools and the restore dry run. Never the records. */
export type BackupCounts = {
  contacts: number
  deletedContacts: number
  visits: number
  timeEntries: number
  dayPlans: number
  recurringPlans: number
  categories: number
  trips: number
  vehicles: number
  pets: number
}

const countEntries = (
  reports: SyncPayload['serviceReportStore']['serviceReports']
) =>
  Object.values(reports ?? {}).reduce(
    (total, year) =>
      total +
      Object.values(year ?? {}).reduce(
        (sum, month) => sum + (month?.length ?? 0),
        0
      ),
    0
  )

export function payloadCounts(payload: SyncPayload): BackupCounts {
  return {
    contacts: payload.contactStore.contacts.length,
    deletedContacts: payload.contactStore.deletedContacts.length,
    visits: payload.conversationStore.conversations.length,
    timeEntries: countEntries(payload.serviceReportStore.serviceReports),
    dayPlans: payload.serviceReportStore.dayPlans.length,
    recurringPlans: payload.serviceReportStore.recurringPlans.length,
    categories: payload.categoryStore?.categories.length ?? 0,
    trips: payload.mileageStore?.trips.length ?? 0,
    vehicles: payload.mileageStore?.vehicles.length ?? 0,
    pets: payload.petStore?.pets.length ?? 0,
  }
}

const stateCounts = (state: LocalMergeState): BackupCounts => ({
  contacts: state.contacts.length,
  deletedContacts: state.deletedContacts.length,
  visits: state.conversations.length,
  timeEntries: countEntries(state.serviceReports),
  dayPlans: state.dayPlans.length,
  recurringPlans: state.recurringPlans.length,
  categories: state.categories.length,
  trips: state.trips.length,
  vehicles: state.vehicles.length,
  pets: state.pets.length,
})

/**
 * What Combine would change, without writing anything: counts before and after,
 * and whether the merge changes anything at all.
 */
export function previewCombine(payloads: SyncPayload[]): {
  changed: boolean
  before: BackupCounts
  after: BackupCounts
} {
  const local = localMergeState()
  const { changed, merged } = mergePayloadsInto(local, payloads)
  return { changed, before: stateCounts(local), after: stateCounts(merged) }
}
