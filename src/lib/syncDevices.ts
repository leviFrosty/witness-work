import { isAccountFilename } from '@/lib/accountFile'

export type SyncDeviceStatus =
  | 'ok'
  | 'newer-version'
  | 'unreadable'
  | 'pre-reset'

export type SyncDeviceFile = {
  deviceId: string | null
  deviceName: string | null

  writtenAt: number | null

  modifiedAt: number
  status: SyncDeviceStatus

  seenAt: number
}

export type SyncDeviceFiles = Record<string, SyncDeviceFile>

export const STALE_SYNC_DEVICE_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

export function isLegacySyncFilename(filename: string): boolean {
  return !filename.startsWith('witness-work-')
}

export function deviceIdFromSyncFilename(filename: string): string | null {
  const match = /^witness-work-(.+)\.json$/.exec(filename)
  return match ? match[1] : null
}

export function mergeSyncDeviceFiles(
  previous: SyncDeviceFiles,
  observed: SyncDeviceFiles,
  readComplete: boolean
): SyncDeviceFiles {
  const next: SyncDeviceFiles = readComplete ? {} : { ...previous }
  for (const [filename, entry] of Object.entries(observed)) {
    if (isAccountFilename(filename)) continue
    next[filename] = {
      ...entry,
      deviceName: entry.deviceName ?? previous[filename]?.deviceName ?? null,
    }
  }
  return next
}

export type SyncDeviceAgeBucket = '<30d' | '30-90d' | '90d+'

export function syncDeviceAgeBucket(
  entry: Pick<SyncDeviceFile, 'modifiedAt'>,
  now = Date.now()
): SyncDeviceAgeBucket {
  const days = (now - entry.modifiedAt) / DAY_MS
  if (days < 30) return '<30d'
  return days < STALE_SYNC_DEVICE_DAYS ? '30-90d' : '90d+'
}

export type SyncDeviceHint =
  | 'pre-reset'
  | 'newer-version'
  | 'unreadable'
  | 'legacy'
  | 'stale'

export function syncDeviceHint(
  filename: string,
  entry: SyncDeviceFile,
  now = Date.now()
): SyncDeviceHint | null {
  if (entry.status !== 'ok') return entry.status
  if (isLegacySyncFilename(filename)) return 'legacy'
  return syncDeviceAgeBucket(entry, now) === '90d+' ? 'stale' : null
}

export type SyncDeviceRemoval = 'allowed' | 'sync-first' | 'update-app'

export function syncDeviceRemoval(
  entry: SyncDeviceFile,
  lastPull: { complete: boolean; issue: string | null; since: number }
): SyncDeviceRemoval {
  if (entry.seenAt < lastPull.since) return 'sync-first'
  switch (entry.status) {
    case 'pre-reset':
    case 'unreadable':
      return 'allowed'
    case 'newer-version':
      return 'update-app'
    case 'ok':
      return lastPull.complete && !lastPull.issue ? 'allowed' : 'sync-first'
  }
}

export type SyncDeviceListItem = SyncDeviceFile & {
  filename: string
  isThisDevice: boolean
}

export function listSyncDevices(
  files: SyncDeviceFiles | null | undefined,
  ownDeviceId: string | null
): SyncDeviceListItem[] {
  return Object.entries(files ?? {})
    .filter(
      ([filename, entry]) =>
        !isAccountFilename(filename) &&
        !!entry &&
        typeof entry.modifiedAt === 'number'
    )
    .map(([filename, entry]) => ({
      ...entry,
      filename,
      isThisDevice:
        !!ownDeviceId && deviceIdFromSyncFilename(filename) === ownDeviceId,
    }))
    .sort(
      (a, b) =>
        Number(b.isThisDevice) - Number(a.isThisDevice) ||
        b.modifiedAt - a.modifiedAt
    )
}
