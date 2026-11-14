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

export type SyncReadOptions = {
  listOnly?: (filename: string) => boolean
}

export type SyncWriteOptions = {
  compact?: boolean

  fold?: boolean
}

export type UploadStatus = {
  uploaded: boolean
  uploading: boolean
  error: { domain: string; code: number } | null
}

export type BinaryFileInfo = {
  filename: string
  modifiedAt: number

  size?: number
}

export type TransportSubscription = { remove: () => void }

export type SyncTransportErrorCode =
  | 'storage-full'
  | 'unauthorized'
  | 'network'
  | 'rate-limited'
  | 'server-error'
  | 'not-found'
  | 'too-large'
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

export type TransferPhases = { start(): void; end(): void }

export interface SyncTransport {
  readonly kind: SyncTransportKind

  readonly writeConfirmsUpload: boolean

  readonly skipsUnchangedWrites?: boolean

  wantsCompaction?(): boolean

  setPushRequester?(request: (() => void) | null): void

  readonly supportsBinaries?: boolean

  readonly binaryWritesPaused?: boolean

  readonly binaryTimeoutMs?: number

  readonly binarySetupTimeoutMs?: number

  readonly writeTimeoutMs?: number

  isAvailable(): boolean

  identityToken(): string | null

  identityTokenMatches(stored: string): boolean | null

  waitForInitialScan(timeoutMs?: number): Promise<boolean>

  readFiles(
    include: (filename: string) => boolean,
    options?: SyncReadOptions
  ): Promise<SyncRead>

  write(
    filename: string,
    json: string,
    options?: SyncWriteOptions
  ): Promise<number>

  supportsUploadStatus(): boolean
  uploadStatus(filename: string): Promise<UploadStatus | null>

  deleteFile(filename: string): Promise<void>

  deleteAll(): Promise<void>

  deleteEndedWebSnapshots?(
    merged: ReadonlyMap<string, number>
  ): Promise<string[]>

  writeBinary(
    filename: string,
    sourcePath: string,
    phases?: TransferPhases
  ): Promise<number>

  readBinary(
    filename: string,
    destinationPath: string,
    phases?: TransferPhases
  ): Promise<number>
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
