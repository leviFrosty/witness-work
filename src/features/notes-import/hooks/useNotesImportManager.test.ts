import { beforeEach, describe, expect, it, vi } from 'vitest'

type Snapshot = {
  remaining: number | null
  limit: number | null
  resetsAt: string | null
  isSupporter: boolean
  refinements: { remaining: number | null; limit: number | null }
}

type PendingRun = {
  args: {
    onKickoff?: (run: { importId: string; subscribeToken: string }) => void
    onCredits?: (credits: Snapshot) => void
  }
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

type ClientErrorConstructor = new (
  code: string,
  message: string,
  status?: number,
  debug?: string,
  credits?: Snapshot
) => Error

const harness = vi.hoisted(() => ({
  stores: new Map<string, Map<string, string>>(),
  pending: [] as PendingRun[],
  persisted: null as unknown,
  persistedWrites: [] as unknown[],
  ClientError: null as ClientErrorConstructor | null,
}))

vi.mock('react-native-mmkv', () => {
  class MMKV {
    private readonly id: string
    constructor(options?: { id?: string }) {
      this.id = options?.id ?? 'default'
      if (!harness.stores.has(this.id)) {
        harness.stores.set(this.id, new Map())
      }
    }
    private data(): Map<string, string> {
      const data = harness.stores.get(this.id)
      if (!data) throw new Error(`Missing MMKV test store ${this.id}`)
      return data
    }
    getString(key: string): string | undefined {
      return this.data().get(key)
    }
    set(key: string, value: string): void {
      this.data().set(key, value)
    }
    contains(key: string): boolean {
      return this.data().has(key)
    }
    delete(key: string): void {
      this.data().delete(key)
    }
    getAllKeys(): string[] {
      return [...this.data().keys()]
    }
  }
  return { MMKV }
})

vi.mock('@sentry/react-native', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))
vi.mock('@/stores/contactsStore', () => ({
  default: { getState: () => ({ contacts: [] }) },
}))
vi.mock('@/stores/categories', () => ({
  default: { getState: () => ({ categories: [] }) },
}))
vi.mock('@/lib/import/writeMappedData', () => ({
  writeMappedDataToStores: vi.fn(),
  undoImport: vi.fn(),
}))
vi.mock('@/features/notes-import/lib/buildNotesImportContext', () => ({
  buildNotesImportContext: () => ({}),
}))
vi.mock('@/features/notes-import/lib/mapNotesImport', () => ({
  mapNotesImport: vi.fn(),
}))
vi.mock('@/features/notes-import/lib/notesContentHash', () => ({
  notesContentHash: async (text: string) => `hash:${text}`,
}))
vi.mock('@/features/notes-import/lib/notesImportCreditsStore', () => ({
  loadPersistedCredits: () => harness.persisted,
  persistCredits: vi.fn((value: unknown) => {
    const copy = structuredClone(value)
    harness.persisted = copy
    harness.persistedWrites.push(copy)
    return copy
  }),
}))
vi.mock('@/features/notes-import/lib/notesImportClient', () => {
  class NotesImportClientError extends Error {
    code: string
    credits?: Snapshot
    debug?: string
    constructor(
      code: string,
      message: string,
      _status?: number,
      debug?: string,
      credits?: Snapshot
    ) {
      super(message)
      this.code = code
      this.debug = debug
      this.credits = credits
    }
  }
  harness.ClientError = NotesImportClientError

  const start = (args: PendingRun['args']) =>
    new Promise((resolve, reject) => {
      harness.pending.push({ args, resolve, reject })
    })

  return {
    NotesImportClientError,
    runNotesImportStreaming: vi.fn(start),
    resumeNotesImport: vi.fn(start),
    destroyNotesImport: vi.fn(async () => undefined),
  }
})

const result = {
  contacts: [],
  visits: [],
  timeEntries: [],
  categories: [],
  publisher: null,
  warnings: [],
  summary: 'Imported notes',
  assistantMessage: '',
}

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  remaining: 4,
  limit: 5,
  resetsAt: '2099-09-01T00:00:00.000Z',
  isSupporter: false,
  refinements: { remaining: 4, limit: 5 },
  ...over,
})

const terminal = (credits: Snapshot) => ({
  result,
  contentHash: 'unused-by-manager',
  refinement: false,
  emptyCharged: false,
  credits,
})

const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

let useNotesImportManager: (typeof import('@/features/notes-import/hooks/useNotesImportManager'))['useNotesImportManager']

beforeEach(async () => {
  vi.useRealTimers()
  vi.resetModules()
  vi.stubGlobal('__DEV__', false)
  for (const store of harness.stores.values()) store.clear()
  harness.pending.length = 0
  harness.persisted = null
  harness.persistedWrites.length = 0
  ;({ useNotesImportManager } = await import(
    '@/features/notes-import/hooks/useNotesImportManager'
  ))
})

describe('useNotesImportManager credit lifecycle', () => {
  it('re-arms a stale import denial when the app becomes active after expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'))
    const reset = '2026-08-02T00:00:00.000Z'
    const hash = await useNotesImportManager.getState().submit('limited notes')
    expect(hash).toBe('hash:limited notes')

    const denial = snapshot({
      remaining: 0,
      resetsAt: reset,
      refinements: { remaining: 5, limit: 5 },
    })
    const ClientError = harness.ClientError
    if (!ClientError) throw new Error('Client error mock was not initialized')
    harness.pending[0].reject(
      new ClientError('limit_reached', 'limit reached', 429, undefined, denial)
    )
    await settle()

    expect(
      useNotesImportManager.getState().runtimes['hash:limited notes']?.error
    ).toBe('limit_reached')

    vi.setSystemTime(new Date(reset))
    useNotesImportManager.getState().appBecameActive()

    expect(harness.pending).toHaveLength(2)
    expect(
      useNotesImportManager.getState().runtimes['hash:limited notes']?.error
    ).toBeNull()
    expect(
      useNotesImportManager.getState().creditsForImport('hash:limited notes')
    ).toMatchObject({ remaining: 5, resetsAt: null })
  })

  it('never persists a failed refinement kickoff projection during focus or expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'))
    const reset = '2026-08-02T00:00:00.000Z'
    const hash = await useNotesImportManager.getState().submit('notes A')
    if (!hash) throw new Error('Expected a content hash')

    harness.pending[0].args.onCredits?.(
      snapshot({ resetsAt: reset, refinements: { remaining: 4, limit: 5 } })
    )
    harness.pending[0].resolve(
      terminal(
        snapshot({
          remaining: 4,
          resetsAt: reset,
          refinements: { remaining: 4, limit: 5 },
        })
      )
    )
    await settle()

    expect(
      await useNotesImportManager.getState().refine(hash, 'change it')
    ).toBe(true)
    harness.pending[1].args.onCredits?.(
      snapshot({
        remaining: 4,
        resetsAt: reset,
        refinements: { remaining: 3, limit: 5 },
      })
    )

    const writesBeforeFocus = harness.persistedWrites.length
    useNotesImportManager.getState().focus()
    expect(harness.persistedWrites).toHaveLength(writesBeforeFocus)

    const ClientError = harness.ClientError
    if (!ClientError) throw new Error('Client error mock was not initialized')
    harness.pending[1].reject(new ClientError('model_error', 'failed'))
    await settle()

    vi.setSystemTime(new Date(reset))
    useNotesImportManager.getState().appBecameActive()

    const persisted = harness.persisted as {
      credits: Snapshot
      refinementsByHash: Record<string, Snapshot['refinements']>
    }
    expect(persisted.credits).toMatchObject({ remaining: 5, resetsAt: null })
    expect(persisted.refinementsByHash[hash]).toEqual({
      remaining: 4,
      limit: 5,
    })
  })

  it('keeps a newer global balance and per-hash refinements when concurrent terminals arrive out of order', async () => {
    const hashA = await useNotesImportManager.getState().submit('notes A')
    const hashB = await useNotesImportManager.getState().submit('notes B')
    if (!hashA || !hashB) throw new Error('Expected content hashes')

    harness.pending[1].resolve(
      terminal(
        snapshot({
          remaining: 3,
          refinements: { remaining: 1, limit: 5 },
        })
      )
    )
    await settle()
    harness.pending[0].resolve(
      terminal(
        snapshot({
          remaining: 4,
          refinements: { remaining: 4, limit: 5 },
        })
      )
    )
    await settle()

    const state = useNotesImportManager.getState()
    expect(state.credits).toMatchObject({ remaining: 3 })
    expect(state.authoritativeCredits).toMatchObject({ remaining: 3 })
    expect(state.creditsForImport(hashA)).toEqual(
      snapshot({
        remaining: 3,
        refinements: { remaining: 4, limit: 5 },
      })
    )
    expect(state.creditsForImport(hashB)).toEqual(
      snapshot({
        remaining: 3,
        refinements: { remaining: 1, limit: 5 },
      })
    )

    const persisted = harness.persisted as {
      credits: Snapshot
      refinementsByHash: Record<string, Snapshot['refinements']>
    }
    expect(persisted.credits).toMatchObject({ remaining: 3 })
    expect(persisted.refinementsByHash).toEqual({
      [hashA]: { remaining: 4, limit: 5 },
      [hashB]: { remaining: 1, limit: 5 },
    })
  })
})
