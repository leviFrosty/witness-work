import type {
  BinaryFileInfo,
  SyncFile,
  SyncTransport,
} from '@/lib/syncTransport/types'

export function createMemoryFolder() {
  let clock = 1_000_000_000_000
  const json = new Map<string, { json: string; modifiedAt: number }>()
  const binaries = new Map<string, { bytes: Uint8Array; modifiedAt: number }>()
  const hooks = {
    failWrite: null as ((name: string) => Error | null) | null,
    failDelete: null as ((name: string) => Error | null) | null,
    onRead: null as ((name: string, json: string) => string) | null,
  }
  const tick = () => (clock += 1_000)
  return {
    json,
    binaries,
    hooks,
    advance: (ms: number) => (clock += ms),
    now: () => clock,
    put(name: string, content: string, modifiedAt = tick()) {
      json.set(name, { json: content, modifiedAt })
    },
    names: () => [...json.keys()].sort(),
    photoNames: () => [...binaries.keys()].sort(),
    everything: () =>
      [
        ...[...json.values()].map((f) => f.json),
        ...[...binaries.values()].map((b) => new TextDecoder().decode(b.bytes)),
      ].join('\n'),
    tick,
  }
}

export type MemoryFolder = ReturnType<typeof createMemoryFolder>

export type LocalFiles = Map<string, Uint8Array>

export function memoryTransport(
  folder: MemoryFolder,
  local: LocalFiles,
  identity = 'apple-account'
): SyncTransport {
  return {
    kind: 'icloud',
    writeConfirmsUpload: false,
    isAvailable: () => true,
    identityToken: () => identity,
    identityTokenMatches: (stored) => stored === identity,
    waitForInitialScan: async () => true,
    async readFiles(include) {
      const files: SyncFile[] = []
      for (const [name, file] of folder.json) {
        if (!include(name)) continue
        files.push({
          filename: name,
          json: folder.hooks.onRead?.(name, file.json) ?? file.json,
          modifiedAt: file.modifiedAt,
        })
      }
      return { files, pending: [] }
    },
    async write(name, content) {
      const failure = folder.hooks.failWrite?.(name)
      if (failure) throw failure
      const modifiedAt = folder.tick()
      folder.json.set(name, { json: content, modifiedAt })
      return modifiedAt
    },
    supportsUploadStatus: () => false,
    uploadStatus: async () => null,
    async deleteFile(name) {
      const failure = folder.hooks.failDelete?.(name)
      if (failure) throw failure
      folder.json.delete(name)
    },
    async deleteAll() {
      folder.json.clear()
    },
    async writeBinary(name, sourcePath) {
      const bytes = local.get(sourcePath)
      if (!bytes) throw new Error(`no local file ${sourcePath}`)
      const failure = folder.hooks.failWrite?.(name)
      if (failure) throw failure
      const modifiedAt = folder.tick()
      folder.binaries.set(name, { bytes: bytes.slice(), modifiedAt })
      return modifiedAt
    },
    async readBinary(name, destination) {
      const file = folder.binaries.get(name)
      if (!file) throw new Error(`missing ${name}`)
      local.set(destination, file.bytes.slice())
      return file.modifiedAt
    },
    async listBinaryFiles(): Promise<BinaryFileInfo[]> {
      return [...folder.binaries].map(([filename, file]) => ({
        filename,
        modifiedAt: file.modifiedAt,
      }))
    },
    async deleteBinaryFile(name) {
      const failure = folder.hooks.failDelete?.(name)
      if (failure) throw failure
      folder.binaries.delete(name)
    },
    async deleteAllBinaries() {
      folder.binaries.clear()
    },
    addRemoteChangeListener: () => ({ remove: () => {} }),
    addAvailabilityChangeListener: () => ({ remove: () => {} }),
  }
}
