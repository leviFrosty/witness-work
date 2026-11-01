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

export type ReadBackupPayload =
  | { ok: true; payload: SyncPayload }
  | { ok: false; problem: 'newer' | 'unreadable' }

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

export function foldBackupPayloads(
  payloads: SyncPayload[]
): SyncPayload | null {
  return foldRemotePayloads(
    payloads.map(({ resetEpoch: _resetEpoch, ...payload }) => payload)
  )
}

const SYNC_BOOKKEEPING = [
  'iCloudResetEpoch',
  'lastiCloudSyncAt',
  'lastiCloudPulledAt',
  'lastiCloudRemoteWrittenAt',
  'lastiCloudRemoteDeviceId',
  'lastiCloudRemoteDeviceName',
] as const

export function replaceLocalWithBackup(folded: SyncPayload): void {
  const prefs = usePreferences.getState()
  const kept = Object.fromEntries(
    SYNC_BOOKKEEPING.map((key) => [key, prefs[key]])
  )
  replaceLocalWithRemote(folded)
  usePreferences.setState(kept)
}

export function combineLocalWithBackup(payloads: SyncPayload[]): boolean {
  const { changed, merged } = mergePayloadsInto(localMergeState(), payloads)
  if (changed) applyMergedState(merged)
  return changed
}

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

export function previewCombine(payloads: SyncPayload[]): {
  changed: boolean
  before: BackupCounts
  after: BackupCounts
} {
  const local = localMergeState()
  const { changed, merged } = mergePayloadsInto(local, payloads)
  return { changed, before: stateCounts(local), after: stateCounts(merged) }
}
