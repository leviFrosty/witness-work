export type SyncTransportKind = 'icloud' | 'google-drive' | 'cloud'

export type SyncFile = {
  filename: string
  json: string

  modifiedAt: number
}

export type SyncRead = {
  files: SyncFile[]

  pending: string[] | null
}

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
  | 'storage-full'
  | 'unauthorized'
  | 'network'
  | 'rate-limited'
  | 'server-error'
  | 'not-found'
  | 'unknown'

export class SyncTransportError extends Error {
  constructor(
    readonly code: SyncTransportErrorCode,
    message: string = code,

    readonly retryAfterMs: number | null = null
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

  readonly writeConfirmsUpload: boolean

  readonly supportsBinaries?: boolean

  readonly writeTimeoutMs?: number

  isAvailable(): boolean

  identityToken(): string | null

  identityTokenMatches(stored: string): boolean | null

  waitForInitialScan(timeoutMs?: number): Promise<boolean>

  readFiles(include: (filename: string) => boolean): Promise<SyncRead>

  write(filename: string, json: string): Promise<number>

  supportsUploadStatus(): boolean
  uploadStatus(filename: string): Promise<UploadStatus | null>

  deleteFile(filename: string): Promise<void>

  deleteAll(): Promise<void>

  writeBinary(filename: string, sourcePath: string): Promise<number>

  readBinary(filename: string, destinationPath: string): Promise<number>
  listBinaryFiles(): Promise<BinaryFileInfo[]>
  deleteBinaryFile(filename: string): Promise<void>
  deleteAllBinaries(): Promise<void>

  addRemoteChangeListener(
    listener: (event: { modifiedAt: number }) => void
  ): TransportSubscription

  setShouldPoll?(shouldPoll: () => boolean): void

  addAvailabilityChangeListener(
    listener: (event: { available: boolean }) => void
  ): TransportSubscription
}
