import { isAccountFilename } from '@/lib/accountFile'
import { sameBytes } from '@/lib/bytes'
import {
  BackupOpenError,
  type BackupPlatform,
} from '@/lib/serverAccount/backupCrypto'
import type { Pause } from '@/lib/syncTransport/server/photoCrypto'
import {
  openPhotoBytes,
  openPhotoName,
  openSnapshot,
  type SealKeyring,
  type SealKeys,
  sealKeyId,
  sealPhotoBytes,
  sealPhotoName,
  sealSnapshot,
} from '@/lib/syncTransport/sealed/sealCrypto'
import {
  isSealedPhotoName,
  isSealedSnapshotName,
  LOCKED_PLACEHOLDER,
  NEWER_PLACEHOLDER,
  parseSealedEnvelope,
  photoFilenameOf,
  photoMiddle,
  readAdvert,
  SEALED_FORMAT,
  sealedEnvelopeJson,
  sealedPhotoMiddle,
  sealedPhotoNameFor,
  sealedSnapshotName,
  snapshotNameOf,
  UNREADABLE_PLACEHOLDER,
  withAdvert,
} from '@/lib/syncTransport/sealed/sealedFiles'
import {
  decideSealing,
  folderIsSealed,
  type FolderView,
  type Holdup,
  type ObservedSnapshot,
  SEALING_QUIET_DEVICE_MS,
  type SealingDecision,
  type SealingWait,
} from '@/lib/syncTransport/sealed/sealingGate'
import {
  type BinaryFileInfo,
  type SyncFile,
  type SyncRead,
  type SyncTransport,
  SyncTransportError,
  syncTransportErrorCode,
} from '@/lib/syncTransport/types'

export type SealingStep = 'seal' | 'write' | 'verify' | 'delete'

export type SealingEvent =
  | { type: 'waiting'; waitingFor: SealingWait; holdups: Holdup[] }
  | { type: 'started' }
  | { type: 'completed' }
  | { type: 'failed'; step: SealingStep; code: string }
  | { type: 'device-resealed' }
  | { type: 'photos'; sealed: number; failed: number; remaining: number }

export type SealingStatus =
  | { state: 'sealed'; otherAccount: boolean }
  | { state: 'plain'; waitingFor: SealingWait; holdups: Holdup[] }

export type SealedFiles = {
  read: (path: string) => Promise<Uint8Array>
  write: (path: string, bytes: Uint8Array) => Promise<void>
  remove: (path: string) => Promise<void>

  tempPath: () => string
}

export type SealedTransportDeps = {
  keyring: () => Promise<SealKeyring | null>

  sealingSwitch: () => boolean

  remembered: {
    has: (identity: string | null) => boolean
    add: (identity: string | null) => void
  }
  files: SealedFiles
  randomBytes: (length: number) => Uint8Array
  now: () => number
  deviceName: () => string
  platform: BackupPlatform
  ownFilename: () => string
  pause?: Pause
  onEvent?: (event: SealingEvent) => void
  onStatus?: (status: SealingStatus) => void
}

const PHOTO_BATCH = 10
const STALE_RESEALS_PER_PUSH = 2
const PHOTO_INDEX_REUSE_MS = 30_000
const PHOTO_INDEX_MISS_RELIST_MS = 3_000

class SealingStepError extends Error {
  constructor(
    readonly step: SealingStep,
    readonly cause: unknown
  ) {
    super(`sealing failed at ${step}`)
    this.name = 'SealingStepError'
  }
}

const isLegacyName = (filename: string) => !filename.startsWith('witness-work-')

type PhotoEntry = {
  sealed?: { name: string; keys: SealKeys; modifiedAt: number; size?: number }
  plain?: { modifiedAt: number; size?: number }
}

type StaleCandidate = { filename: string; json: string; modifiedAt: number }

export type SealedTransport = SyncTransport & {
  status: () => SealingStatus | null
}

export function createSealedTransport(
  inner: SyncTransport,
  deps: SealedTransportDeps
): SealedTransport {
  let identity: string | null | undefined
  let view: FolderView | null = null
  let ownStored = { plain: false, sealed: false }
  let lockedSeen = false
  let staleCandidates: StaleCandidate[] = []
  const lastWritten = new Map<string, string>()
  let photoIndex: Map<string, PhotoEntry> | null = null
  let photoIndexAt = 0
  let lastStatus: SealingStatus | null = null

  const forIdentity = () => {
    const current = inner.identityToken()
    if (current === identity) return
    identity = current
    view = null
    ownStored = { plain: false, sealed: false }
    lockedSeen = false
    staleCandidates = []
    lastWritten.clear()
    photoIndex = null
  }

  const keyringOrNull = () => deps.keyring().catch(() => null)

  const sealed = () => {
    forIdentity()
    return folderIsSealed(view, deps.remembered.has(identity ?? null))
  }

  const decide = (keyring: SealKeyring | null): SealingDecision =>
    decideSealing({
      view,
      remembered: deps.remembered.has(identity ?? null),
      ownKey: keyring ? sealKeyId(keyring.current.syncKey) : null,
      switchOn: deps.sealingSwitch(),
      now: deps.now(),
    })

  const report = (decision: SealingDecision) => {
    const status: SealingStatus =
      decision.mode === 'plain'
        ? {
            state: 'plain',
            waitingFor: decision.waitingFor,
            holdups: decision.holdups,
          }
        : { state: 'sealed', otherAccount: lockedSeen }
    lastStatus = status
    deps.onStatus?.(status)
    if (decision.mode === 'plain')
      deps.onEvent?.({
        type: 'waiting',
        waitingFor: decision.waitingFor,
        holdups: decision.holdups,
      })
  }

  const meta = (deviceName = deps.deviceName()) => ({
    deviceName,
    platform: deps.platform,
    createdAt: deps.now(),
  })

  async function verifyStored(
    keyring: SealKeyring,
    filename: string,
    payloadJson: string
  ): Promise<void> {
    const stored = sealedSnapshotName(filename)
    const back = await inner.readFiles((name) => name === stored, {
      fresh: true,
    })
    const file = back.files.find((f) => f.filename === stored)
    const envelope = file ? parseSealedEnvelope(file.json) : null
    if (!envelope) throw new Error('sealed copy missing on read-back')
    const opened = openSnapshot(
      { current: keyring.current, older: [] },
      filename,
      envelope.blob
    )
    if (JSON.stringify(opened.payload) !== payloadJson)
      throw new Error('sealed copy differs on read-back')
  }

  async function writeSealed(
    keyring: SealKeyring,
    filename: string,
    json: string,
    options: {
      verify: boolean
      deviceName?: string
      write?: Parameters<SyncTransport['write']>[2]
    }
  ): Promise<{ modifiedAt: number; verifyError: SealingStepError | null }> {
    let step: SealingStep = 'seal'
    let modifiedAt: number
    let payloadJson = ''
    try {
      const payload = JSON.parse(json) as unknown
      if (options.verify) payloadJson = JSON.stringify(payload)
      const blob = sealSnapshot(
        keyring.current.syncKey,
        filename,
        payload,
        meta(options.deviceName),
        deps.randomBytes(24)
      )
      if (options.verify) {
        const opened = openSnapshot(
          { current: keyring.current, older: [] },
          filename,
          blob
        )
        if (JSON.stringify(opened.payload) !== payloadJson)
          throw new Error('sealed copy differs in memory')
      }
      step = 'write'
      const stored = sealedSnapshotName(filename)
      modifiedAt = await inner.write(
        stored,
        sealedEnvelopeJson(sealKeyId(keyring.current.syncKey), blob),
        options.write
      )
      lastWritten.set(filename, stored)
    } catch (error) {
      throw new SealingStepError(step, error)
    }
    if (!options.verify) return { modifiedAt, verifyError: null }
    try {
      await verifyStored(keyring, filename, payloadJson)
      return { modifiedAt, verifyError: null }
    } catch (error) {
      return { modifiedAt, verifyError: new SealingStepError('verify', error) }
    }
  }

  const failure = (error: unknown) => ({
    step: error instanceof SealingStepError ? error.step : ('write' as const),
    code:
      syncTransportErrorCode(
        error instanceof SealingStepError ? error.cause : error
      ) ?? 'unknown',
  })

  async function resealQuietDevices(keyring: SealKeyring): Promise<void> {
    const now = deps.now()
    const due = staleCandidates
      .filter((c) => now - c.modifiedAt >= SEALING_QUIET_DEVICE_MS)
      .slice(0, STALE_RESEALS_PER_PUSH)
    for (const candidate of due) {
      staleCandidates = staleCandidates.filter((c) => c !== candidate)
      try {
        const payload = JSON.parse(candidate.json) as { deviceName?: unknown }
        const { verifyError } = await writeSealed(
          keyring,
          candidate.filename,
          candidate.json,
          {
            verify: true,
            deviceName:
              typeof payload?.deviceName === 'string' ? payload.deviceName : '',
          }
        )
        if (verifyError) throw verifyError
        const again = await inner.readFiles(
          (name) => name === candidate.filename,
          { fresh: true, listOnly: () => true }
        )
        const plain = again.files.find((f) => f.filename === candidate.filename)
        if (plain && plain.modifiedAt === candidate.modifiedAt) {
          await inner.deleteFile(candidate.filename)
          deps.onEvent?.({ type: 'device-resealed' })
        }
      } catch {}
    }
  }

  function openStored(
    keyring: SealKeyring | null,
    filename: string,
    file: SyncFile
  ): { json: string; key: string | null; opened: boolean } {
    const envelope = parseSealedEnvelope(file.json)
    if (!envelope)
      return { json: UNREADABLE_PLACEHOLDER, key: null, opened: false }
    if (envelope.format > SEALED_FORMAT)
      return { json: NEWER_PLACEHOLDER, key: envelope.key, opened: false }
    const known = keyring
      ? [keyring.current, ...keyring.older].map((keys) =>
          sealKeyId(keys.syncKey)
        )
      : []
    if (!keyring || !known.includes(envelope.key))
      return { json: LOCKED_PLACEHOLDER, key: envelope.key, opened: false }
    try {
      return {
        json: JSON.stringify(
          openSnapshot(keyring, filename, envelope.blob).payload
        ),
        key: envelope.key,
        opened: true,
      }
    } catch (error) {
      const newer =
        error instanceof BackupOpenError && error.problem === 'newer'
      return {
        json: newer ? NEWER_PLACEHOLDER : UNREADABLE_PLACEHOLDER,
        key: envelope.key,
        opened: false,
      }
    }
  }

  async function listPhotos(): Promise<Map<string, PhotoEntry>> {
    forIdentity()
    const keyring = await keyringOrNull()
    const keysets = keyring ? [keyring.current, ...keyring.older] : []
    const index = new Map<string, PhotoEntry>()
    for (const file of await inner.listBinaryFiles()) {
      if (isSealedPhotoName(file.filename)) {
        const middle = sealedPhotoMiddle(file.filename)
        for (const keys of keysets) {
          const original = openPhotoName(keys.photoKeys, middle)
          if (!original) continue
          const filename = photoFilenameOf(original)
          const entry = index.get(filename) ?? {}
          if (!entry.sealed || entry.sealed.modifiedAt < file.modifiedAt)
            entry.sealed = {
              name: file.filename,
              keys,
              modifiedAt: file.modifiedAt,
              size: file.size,
            }
          index.set(filename, entry)
          break
        }
      } else {
        const entry = index.get(file.filename) ?? {}
        entry.plain = { modifiedAt: file.modifiedAt, size: file.size }
        index.set(file.filename, entry)
      }
    }
    photoIndex = index
    photoIndexAt = deps.now()
    return index
  }

  const photoEntry = async (filename: string) => {
    forIdentity()
    const age = deps.now() - photoIndexAt
    if (
      !photoIndex ||
      age >= PHOTO_INDEX_REUSE_MS ||
      (!photoIndex.has(filename) && age >= PHOTO_INDEX_MISS_RELIST_MS)
    )
      await listPhotos()
    return photoIndex?.get(filename) ?? null
  }

  const sealedPhotoName = (keys: SealKeys, filename: string) => {
    const middle = photoMiddle(filename)
    const sealedMiddle = middle ? sealPhotoName(keys.photoKeys, middle) : null
    if (!sealedMiddle)
      throw new SyncTransportError('too-large', 'photo name too long to seal')
    return sealedPhotoNameFor(sealedMiddle)
  }

  async function withTemp<T>(run: (path: string) => Promise<T>): Promise<T> {
    const path = deps.files.tempPath()
    try {
      return await run(path)
    } finally {
      await deps.files.remove(path).catch(() => undefined)
    }
  }

  async function uploadSealedPhoto(
    keys: SealKeys,
    filename: string,
    bytes: Uint8Array,
    phases?: Parameters<SyncTransport['writeBinary']>[2]
  ): Promise<{ name: string; modifiedAt: number }> {
    const name = sealedPhotoName(keys, filename)
    const blob = await sealPhotoBytes(
      keys.photoKeys,
      filename,
      bytes,
      deps.randomBytes(24),
      deps.pause
    )
    const modifiedAt = await withTemp(async (path) => {
      await deps.files.write(path, blob)
      return inner.writeBinary(name, path, phases)
    })
    return { name, modifiedAt }
  }

  async function downloadSealedPhoto(
    sealedName: string,
    keys: SealKeys,
    filename: string,
    phases?: Parameters<SyncTransport['readBinary']>[2]
  ): Promise<{ bytes: Uint8Array; modifiedAt: number }> {
    return withTemp(async (path) => {
      const modifiedAt = await inner.readBinary(sealedName, path, phases)
      const blob = await deps.files.read(path)
      const bytes = await openPhotoBytes(
        keys.photoKeys,
        filename,
        blob,
        deps.pause
      )
      return { bytes, modifiedAt }
    })
  }

  async function writeInSealedFolder(
    keyring: SealKeyring,
    filename: string,
    json: string,
    options: Parameters<SyncTransport['write']>[2]
  ): Promise<number> {
    const own = filename === deps.ownFilename()
    const migrating = own && ownStored.plain
    let written: Awaited<ReturnType<typeof writeSealed>>
    try {
      written = await writeSealed(keyring, filename, json, {
        verify: migrating,
        write: options,
      })
    } catch (error) {
      if (migrating) deps.onEvent?.({ type: 'failed', ...failure(error) })
      throw error instanceof SealingStepError ? error.cause : error
    }
    if (written.verifyError) {
      deps.onEvent?.({ type: 'failed', ...failure(written.verifyError) })
    } else if (migrating) {
      try {
        await inner.deleteFile(filename)
        ownStored.plain = false
      } catch (error) {
        deps.onEvent?.({
          type: 'failed',
          ...failure(new SealingStepError('delete', error)),
        })
      }
    }
    if (own) ownStored.sealed = true
    deps.remembered.add(identity ?? null)
    if (own && staleCandidates.length) await resealQuietDevices(keyring)
    return written.modifiedAt
  }

  async function startSealing(
    keyring: SealKeyring,
    filename: string,
    json: string,
    options: Parameters<SyncTransport['write']>[2]
  ): Promise<number | null> {
    deps.onEvent?.({ type: 'started' })
    let written: Awaited<ReturnType<typeof writeSealed>>
    try {
      written = await writeSealed(keyring, filename, json, {
        verify: true,
        write: options,
      })
    } catch (error) {
      deps.onEvent?.({ type: 'failed', ...failure(error) })
      if (error instanceof SealingStepError && error.step === 'write')
        await inner
          .deleteFile(sealedSnapshotName(filename))
          .catch(() => undefined)
      lastWritten.delete(filename)
      return null
    }
    if (written.verifyError) {
      deps.onEvent?.({ type: 'failed', ...failure(written.verifyError) })
      await inner
        .deleteFile(sealedSnapshotName(filename))
        .catch(() => undefined)
      lastWritten.delete(filename)
      return null
    }
    ownStored.sealed = true
    try {
      await inner.deleteFile(filename)
      ownStored.plain = false
    } catch (error) {
      deps.onEvent?.({
        type: 'failed',
        ...failure(new SealingStepError('delete', error)),
      })
      ownStored.plain = true
    }
    if (view) view = { ...view, ownSealed: true }
    deps.remembered.add(identity ?? null)
    deps.onEvent?.({ type: 'completed' })
    report(decide(keyring))
    return written.modifiedAt
  }

  const transport: SealedTransport = {
    get kind() {
      return inner.kind
    },
    get writeConfirmsUpload() {
      return inner.writeConfirmsUpload
    },
    get supportsBinaries() {
      return inner.supportsBinaries
    },
    get binaryWritesPaused() {
      return inner.binaryWritesPaused
    },
    get binaryTimeoutMs() {
      return inner.binaryTimeoutMs
    },
    get binarySetupTimeoutMs() {
      return inner.binarySetupTimeoutMs
    },
    get writeTimeoutMs() {
      return inner.writeTimeoutMs
    },
    setShouldPoll: inner.setShouldPoll?.bind(inner),
    isAvailable: () => inner.isAvailable(),
    identityToken: () => inner.identityToken(),
    identityTokenMatches: (stored) => inner.identityTokenMatches(stored),
    waitForInitialScan: (timeoutMs) => inner.waitForInitialScan(timeoutMs),
    status: () => lastStatus,

    async readFiles(include, options): Promise<SyncRead> {
      forIdentity()
      const keyring = await keyringOrNull()
      const own = deps.ownFilename()
      let full = true
      const read = await inner.readFiles(
        (stored) => {
          const filename = snapshotNameOf(stored)
          const wanted = include(filename)
          if (!wanted && !isAccountFilename(filename) && filename !== own)
            full = false
          return wanted
        },
        {
          ...options,
          listOnly: (stored) =>
            options?.listOnly?.(snapshotNameOf(stored)) ?? false,
        }
      )
      const groups = new Map<string, { plain?: SyncFile; sealed?: SyncFile }>()
      for (const file of read.files) {
        const filename = snapshotNameOf(file.filename)
        const group = groups.get(filename) ?? {}
        if (isSealedSnapshotName(file.filename)) group.sealed = file
        else group.plain = file
        groups.set(filename, group)
      }
      const files: SyncFile[] = []
      const snapshots: ObservedSnapshot[] = []
      const stale: StaleCandidate[] = []
      let ownSealed = false
      let locked = false
      for (const [filename, group] of groups) {
        const listOnly = options?.listOnly?.(filename) ?? false
        if (filename === own) ownSealed = group.sealed !== undefined
        let sealedCopy: { json: string; key: string | null; opened: boolean } =
          { json: '', key: null, opened: false }
        if (group.sealed && !listOnly)
          sealedCopy = openStored(keyring, filename, group.sealed)
        else if (group.sealed)
          sealedCopy = {
            json: '',
            key: parseSealedEnvelope(group.sealed.json)?.key ?? null,
            opened: true,
          }
        const plain = group.plain
        let chosen: SyncFile
        if (group.sealed && sealedCopy.opened) {
          chosen =
            plain && plain.modifiedAt > group.sealed.modifiedAt
              ? { ...plain, filename }
              : { ...group.sealed, filename, json: sealedCopy.json }
        } else if (plain) {
          chosen = { ...plain, filename }
        } else {
          chosen = { ...group.sealed!, filename, json: sealedCopy.json }
          if (sealedCopy.json === LOCKED_PLACEHOLDER) locked = true
        }
        files.push(chosen)
        if (filename === own || isAccountFilename(filename)) continue
        const modifiedAt = Math.max(
          plain?.modifiedAt ?? 0,
          group.sealed?.modifiedAt ?? 0
        )
        snapshots.push({
          filename,
          modifiedAt,
          sealedKey: group.sealed ? (sealedCopy.key ?? '') : null,
          advert: plain && !listOnly ? readAdvert(plain.json) : null,
          hasPlain: !!plain,
        })
        if (
          plain &&
          !group.sealed &&
          !listOnly &&
          !isLegacyName(filename) &&
          plain.json
        )
          stale.push({
            filename,
            json: plain.json,
            modifiedAt: plain.modifiedAt,
          })
      }
      const pending = read.pending
        ? [...new Set(read.pending.map(snapshotNameOf))]
        : null
      if (full) {
        const ownGroup = groups.get(own)
        ownStored = { plain: !!ownGroup?.plain, sealed: !!ownGroup?.sealed }
        view = {
          readAt: deps.now(),
          complete: pending !== null && pending.length === 0,
          snapshots,
          ownSealed,
        }
        lockedSeen = locked
        staleCandidates = stale.filter(
          (c) => deps.now() - c.modifiedAt >= SEALING_QUIET_DEVICE_MS
        )
        report(decide(keyring))
      }
      files.sort((a, b) => a.filename.localeCompare(b.filename))
      return { files, pending }
    },

    async write(filename, json, options) {
      forIdentity()
      if (isAccountFilename(filename)) {
        const modifiedAt = await inner.write(filename, json, options)
        lastWritten.set(filename, filename)
        return modifiedAt
      }
      const keyring = await keyringOrNull()
      const decision = decide(keyring)
      if (decision.mode === 'start' && keyring) {
        const done = await startSealing(keyring, filename, json, options)
        if (done !== null) return done
      } else if (decision.mode === 'sealed') {
        if (!keyring)
          throw new SyncTransportError(
            'unauthorized',
            'no account key for a sealed folder'
          )
        return writeInSealedFolder(keyring, filename, json, options)
      }
      const modifiedAt = await inner.write(
        filename,
        withAdvert(json, {
          key: keyring ? sealKeyId(keyring.current.syncKey) : null,
        }),
        options
      )
      lastWritten.set(filename, filename)
      if (filename === deps.ownFilename()) ownStored.plain = true
      return modifiedAt
    },

    supportsUploadStatus: () => inner.supportsUploadStatus(),
    uploadStatus: (filename) =>
      inner.uploadStatus(lastWritten.get(filename) ?? filename),

    async deleteFile(filename) {
      forIdentity()
      await inner.deleteFile(sealedSnapshotName(filename))
      await inner.deleteFile(filename)
      lastWritten.delete(filename)
      if (filename === deps.ownFilename())
        ownStored = { plain: false, sealed: false }
    },

    async deleteAll() {
      forIdentity()
      await inner.deleteAll()
      lastWritten.clear()
      ownStored = { plain: false, sealed: false }
      if (view) view = { ...view, snapshots: [], ownSealed: false }
      staleCandidates = []
    },

    async writeBinary(filename, sourcePath, phases) {
      if (!sealed()) return inner.writeBinary(filename, sourcePath, phases)
      const keyring = await keyringOrNull()
      if (!keyring)
        throw new SyncTransportError(
          'unauthorized',
          'no account key for a sealed folder'
        )
      const bytes = await deps.files.read(sourcePath)
      const { name, modifiedAt } = await uploadSealedPhoto(
        keyring.current,
        filename,
        bytes,
        phases
      )
      if (photoIndex) {
        const entry = photoIndex.get(filename) ?? {}
        entry.sealed = { name, keys: keyring.current, modifiedAt }
        photoIndex.set(filename, entry)
      }
      return modifiedAt
    },

    async readBinary(filename, destinationPath, phases) {
      const entry = await photoEntry(filename)
      if (entry?.sealed) {
        try {
          const { bytes, modifiedAt } = await downloadSealedPhoto(
            entry.sealed.name,
            entry.sealed.keys,
            filename,
            phases
          )
          await deps.files.write(destinationPath, bytes)
          return modifiedAt
        } catch (error) {
          if (!entry.plain) {
            if (error instanceof SyncTransportError) throw error
            throw new SyncTransportError('unknown', 'sealed photo unreadable')
          }
        }
      }
      return inner.readBinary(filename, destinationPath, phases)
    },

    async listBinaryFiles(): Promise<BinaryFileInfo[]> {
      const index = await listPhotos()
      return [...index].map(([filename, entry]) => {
        const copy = entry.sealed ?? entry.plain!
        return {
          filename,
          modifiedAt: copy.modifiedAt,
          ...(copy.size !== undefined && { size: copy.size }),
        }
      })
    },

    async deleteBinaryFile(filename) {
      const keyring = await keyringOrNull()
      const names = new Set<string>([filename])
      const known = photoIndex?.get(filename)?.sealed?.name
      if (known) names.add(known)
      if (keyring && photoMiddle(filename)) {
        try {
          names.add(sealedPhotoName(keyring.current, filename))
        } catch {}
      }
      for (const name of names) await inner.deleteBinaryFile(name)
      photoIndex?.delete(filename)
    },

    async deleteAllBinaries() {
      await inner.deleteAllBinaries()
      photoIndex = null
    },

    async migratePhotos(shouldStop) {
      if (!sealed() || !deps.sealingSwitch()) return
      const keyring = await keyringOrNull()
      if (!keyring) return
      const index = await listPhotos()
      const todo = [...index].filter(([, entry]) => entry.plain)
      let moved = 0
      let failed = 0
      for (const [filename, entry] of todo.slice(0, PHOTO_BATCH)) {
        if (shouldStop()) break
        try {
          let original: Uint8Array | null = null
          let target = entry.sealed
          if (!target) {
            original = await withTemp(async (path) => {
              await inner.readBinary(filename, path)
              return deps.files.read(path)
            })
            const { name, modifiedAt } = await uploadSealedPhoto(
              keyring.current,
              filename,
              original
            )
            target = { name, keys: keyring.current, modifiedAt }
          }
          const { bytes } = await downloadSealedPhoto(
            target.name,
            target.keys,
            filename
          )
          if (original && !sameBytes(bytes, original))
            throw new Error('sealed photo differs on read-back')
          await inner.deleteBinaryFile(filename)
          index.set(filename, { sealed: target })
          moved++
        } catch {
          failed++
        }
      }
      if (moved || failed)
        deps.onEvent?.({
          type: 'photos',
          sealed: moved,
          failed,
          remaining: todo.length - moved,
        })
    },

    addRemoteChangeListener: (listener) =>
      inner.addRemoteChangeListener(listener),
    addAvailabilityChangeListener: (listener) =>
      inner.addAvailabilityChangeListener(listener),
  }
  return transport
}
