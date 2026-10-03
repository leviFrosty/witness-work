import { isAccountFilename } from '@/lib/accountFile'

/**
 * What this device knows about each device's iCloud snapshot file
 * (`witness-work-<deviceId>.json`), for the Settings Devices list. Recorded
 * from the reads `pullAndMerge` already makes: `readFiles` marks the versions
 * it reads as observed and silences their remote-change events, so nothing
 * reads a file just to describe it. Device-local
 * (`NON_SYNCABLE_PREFERENCE_KEYS`) and cleared on an Apple Account change,
 * since another account is another container. See docs/icloud-sync.md.
 */

/**
 * - `ok`: merged by the pull that read it.
 * - `newer-version`: written by a newer app version; this device can't read it.
 * - `unreadable`: not a valid payload for any app version.
 * - `pre-reset`: from a reset generation a later reset replaced.
 */
export type SyncDeviceStatus =
  | 'ok'
  | 'newer-version'
  | 'unreadable'
  | 'pre-reset'

export type SyncDeviceFile = {
  deviceId: string | null
  deviceName: string | null
  /** Payload `writtenAt`; null for this device's own file and unparsed ones. */
  writtenAt: number | null
  /** The file's modification time in the container. */
  modifiedAt: number
  status: SyncDeviceStatus
  /** When this device last read the file. */
  seenAt: number
}

/** Keyed by filename. */
export type SyncDeviceFiles = Record<string, SyncDeviceFile>

export const STALE_SYNC_DEVICE_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The single-file name from before per-device files, and its iCloud conflict
 * copies (`witness-work 2.json`). Written only by older app versions.
 */
export function isLegacySyncFilename(filename: string): boolean {
  return !filename.startsWith('witness-work-')
}

/** The device id a per-device filename carries. */
export function deviceIdFromSyncFilename(filename: string): string | null {
  const match = /^witness-work-(.+)\.json$/.exec(filename)
  return match ? match[1] : null
}

/**
 * Folds one read's observations into the stored entries. A file this read
 * listed but couldn't read keeps its earlier entry. Entries for files the
 * listing no longer has are dropped only after a complete read, where every
 * listed file was read: a partial one can't tell a removed file from one still
 * downloading. A newer-version or unreadable file keeps the name it last had.
 */
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

/** The short status hint the Devices list shows, if any. */
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

/**
 * Whether another device's file can be removed, judged on a pull since `since`
 * that read it; a file that pull couldn't read may have changed. A snapshot
 * from the current generation may hold data this device doesn't, so that pull
 * must also be complete with no sync issue. A pre-reset snapshot's data was
 * intentionally replaced, and no app version can read an unreadable file, so
 * those go even while another file keeps pulls incomplete. A newer-version file
 * waits until this device can read it.
 */
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

/** This device first, then the most recently written. Never the account file. */
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
