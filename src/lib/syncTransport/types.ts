/**
 * The storage a sync engine talks to (ADR 0019). The engine in
 * `src/app/sync/iCloudSync.ts` owns every sync decision — payloads, merges,
 * resets, photos, retries — and reads and writes files only through this
 * interface. iOS uses the iCloud ubiquity container (`iCloudTransport`),
 * Android the Google Drive app data folder (`googleDriveTransport`).
 *
 * A transport is a flat, private namespace of named files owned by one cloud
 * account:
 *
 * - JSON sync files: `witness-work-<deviceId>.json`, the account file
 *   (`witness-work-account.json`), and on iOS legacy `witness-work*.json`.
 * - Photo binaries: `witness-work-img-*.jpg`.
 *
 * Names are unique within the namespace, as filenames are in a folder. A
 * transport whose storage allows duplicate names (Drive) presents the newest
 * copy and removes the rest when it next writes or deletes that name.
 */

export type SyncTransportKind = 'icloud' | 'google-drive'

export type SyncFile = {
  filename: string
  json: string
  /** When the cloud last saw this file's content change, in epoch ms. */
  modifiedAt: number
}

export type SyncRead = {
  files: SyncFile[]
  /**
   * Matching files that couldn't be read this time (still downloading, or a
   * download failed). A read with any is incomplete. `null` when the transport
   * can't tell.
   */
  pending: string[] | null
}

/**
 * Whether the cloud has the current version of a written file. `error` is the
 * platform's last upload failure as a domain and code (no message).
 */
export type UploadStatus = {
  uploaded: boolean
  uploading: boolean
  error: { domain: string; code: number } | null
}

export type BinaryFileInfo = {
  filename: string
  modifiedAt: number
}

export type TransportSubscription = { remove: () => void }

export type SyncTransportErrorCode =
  /** The cloud account has no room for the write. */
  | 'storage-full'
  /** Access was revoked or expired and can't be renewed without the user. */
  | 'unauthorized'
  /** Offline, timed out, or the service is unavailable. */
  | 'network'
  /** The service is throttling this user or app; retry later. */
  | 'rate-limited'
  | 'not-found'
  | 'unknown'

/**
 * A failed transport operation, classified so the engine never inspects message
 * text. iCloud's bridge rejects with plain errors and reports quota through
 * `uploadStatus` instead.
 */
export class SyncTransportError extends Error {
  constructor(
    readonly code: SyncTransportErrorCode,
    message: string = code
  ) {
    super(message)
    this.name = 'SyncTransportError'
  }
}

export const syncTransportErrorCode = (
  error: unknown
): SyncTransportErrorCode | null =>
  error instanceof SyncTransportError ? error.code : null

export interface SyncTransport {
  readonly kind: SyncTransportKind
  /**
   * True when a resolved `write` is already in the cloud (Drive uploads
   * synchronously). False when the platform uploads later (iCloud), in which
   * case `uploadStatus` may confirm it.
   */
  readonly writeConfirmsUpload: boolean
  /** Signed in and permitted to use the namespace right now. */
  isAvailable(): boolean
  /**
   * An opaque token for the cloud account the namespace belongs to, compared
   * across launches to notice an account switch. Null when signed out or
   * unknown.
   */
  identityToken(): string | null
  /**
   * Whether `stored`, an earlier `identityToken`, names the current account.
   * Null when it can't be compared.
   */
  identityTokenMatches(stored: string): boolean | null
  /**
   * Resolves true once a listing of the namespace is trustworthy, or false when
   * `timeoutMs` passes first. A listing made before then may miss files.
   */
  waitForInitialScan(timeoutMs?: number): Promise<boolean>
  /**
   * Reads the JSON files whose names pass `include`. Reading a file marks its
   * current version observed, which silences the remote-change event for that
   * version, so include only files the caller consumes.
   */
  readFiles(include: (filename: string) => boolean): Promise<SyncRead>
  /** Writes a JSON file; resolves to its modification time in epoch ms. */
  write(filename: string, json: string): Promise<number>
  /** Whether `uploadStatus` can answer. */
  supportsUploadStatus(): boolean
  uploadStatus(filename: string): Promise<UploadStatus | null>
  /** Deletes one JSON file. Idempotent. */
  deleteFile(filename: string): Promise<void>
  /** Deletes every JSON sync file, including the account file. */
  deleteAll(): Promise<void>
  /** Uploads a local file as a photo binary; resolves to its mtime. */
  writeBinary(filename: string, sourcePath: string): Promise<number>
  /** Downloads a photo binary to a local path; resolves to its cloud mtime. */
  readBinary(filename: string, destinationPath: string): Promise<number>
  listBinaryFiles(): Promise<BinaryFileInfo[]>
  deleteBinaryFile(filename: string): Promise<void>
  deleteAllBinaries(): Promise<void>
  /**
   * Fires when a file changed in the cloud after this device last read or wrote
   * it — usually another device's push.
   */
  addRemoteChangeListener(
    listener: (event: { modifiedAt: number }) => void
  ): TransportSubscription
  /** Fires when `isAvailable` or the account behind it changes. */
  addAvailabilityChangeListener(
    listener: (event: { available: boolean }) => void
  ): TransportSubscription
}
