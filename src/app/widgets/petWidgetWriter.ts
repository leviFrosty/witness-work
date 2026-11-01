import type {
  PetWidgetBuild,
  PetWidgetFile,
  PetWidgetPlan,
  PetWidgetSnapshot,
} from '@/app/widgets/petWidget'

export const PET_WRITTEN_KEY = 'widgetPetWritten'

export const PET_FAILURE_KEY = 'widgetPetFailure'

export const PET_RETRY_MS = 60 * 60 * 1000

export type PetWritten = {
  hash: string | null
  snapshot: PetWidgetSnapshot | null

  files: string[]

  previousFiles: string[]
}

export type PreparedPet = {
  snapshot: PetWidgetSnapshot | null

  files: string[]
  hash: string | null

  fresh: boolean

  written: PetWritten
}

export type PetWidgetWriterDeps = {
  storage: {
    getString(key: string): string | undefined
    set(key: string, value: string): void
  }
  bridge: {
    writeFile(name: string, base64: string): Promise<void>
    pruneFiles(keep: string[]): Promise<void>
  }

  render: (plan: PetWidgetPlan) => PetWidgetBuild
  onError?: (message: string, error: unknown) => void
  now?: () => number
}

const NOTHING_WRITTEN: PetWritten = {
  hash: null,
  snapshot: null,
  files: [],
  previousFiles: [],
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []

export function createPetWidgetWriter({
  storage,
  bridge,
  render,
  onError = () => {},
  now = Date.now,
}: PetWidgetWriterDeps) {
  const writtenFiles = new Set<string>()

  function readWritten(): PetWritten {
    try {
      const raw = storage.getString(PET_WRITTEN_KEY)
      if (!raw) return NOTHING_WRITTEN
      const value = JSON.parse(raw) as Partial<PetWritten>
      return {
        hash: typeof value.hash === 'string' ? value.hash : null,
        snapshot:
          value.snapshot && typeof value.snapshot === 'object'
            ? value.snapshot
            : null,
        files: stringList(value.files),
        previousFiles: stringList(value.previousFiles),
      }
    } catch {
      return NOTHING_WRITTEN
    }
  }

  function failedRecently(hash: string): boolean {
    try {
      const raw = storage.getString(PET_FAILURE_KEY)
      if (!raw) return false
      const failure = JSON.parse(raw) as { hash?: unknown; at?: unknown }
      return (
        failure.hash === hash &&
        typeof failure.at === 'number' &&
        now() - failure.at < PET_RETRY_MS
      )
    } catch {
      return false
    }
  }

  const markFailed = (hash: string) =>
    storage.set(PET_FAILURE_KEY, JSON.stringify({ hash, at: now() }))

  async function writeFiles(files: PetWidgetFile[]): Promise<boolean> {
    let ok = true
    for (const file of files) {
      if (writtenFiles.has(file.name)) continue
      try {
        await bridge.writeFile(file.name, file.base64)

        writtenFiles.add(file.name)
      } catch (e) {
        ok = false
        onError(`failed to write ${file.name}`, e)
      }
    }
    return ok
  }

  const keepWritten = (written: PetWritten): PreparedPet => ({
    snapshot: written.snapshot,
    files: written.files,
    hash: written.hash,
    fresh: false,
    written,
  })

  return {
    async prepare(plan: () => PetWidgetPlan | null): Promise<PreparedPet> {
      const written = readWritten()
      let hash: string | null = null
      try {
        const planned = plan()
        if (!planned)
          return {
            snapshot: null,
            files: [],
            hash: null,
            fresh: false,
            written,
          }
        hash = planned.hash
        if (planned.hash === written.hash && written.snapshot)
          return keepWritten(written)
        if (failedRecently(planned.hash)) return keepWritten(written)
        const build = render(planned)
        if (!(await writeFiles(build.files))) {
          markFailed(planned.hash)
          return keepWritten(written)
        }
        return {
          snapshot: build.snapshot,
          files: build.files.map((file) => file.name),
          hash: planned.hash,
          fresh: true,
          written,
        }
      } catch (e) {
        if (hash) markFailed(hash)
        onError('failed to build the pet widget', e)
        return keepWritten(written)
      }
    },

    unchanged(prepared: PreparedPet): void {
      if (!prepared.fresh) return
      storage.set(
        PET_WRITTEN_KEY,
        JSON.stringify({ ...prepared.written, hash: prepared.hash })
      )
    },

    async written(prepared: PreparedPet): Promise<void> {
      const next: PetWritten = {
        hash: prepared.hash,
        snapshot: prepared.snapshot,
        files: prepared.files,
        previousFiles: prepared.written.files,
      }
      storage.set(PET_WRITTEN_KEY, JSON.stringify(next))
      const keep = [...new Set([...next.files, ...next.previousFiles])]
      try {
        await bridge.pruneFiles(keep)
        for (const name of writtenFiles)
          if (!keep.includes(name)) writtenFiles.delete(name)
      } catch (e) {
        writtenFiles.clear()
        onError('failed to prune pet images', e)
      }
    },
  }
}

export type PetWidgetWriter = ReturnType<typeof createPetWidgetWriter>
