import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { createJSONStorage, type PersistOptions } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'

const disk = vi.hoisted(() => new Map<string, string>())
const captureException = vi.hoisted(() => vi.fn())

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException, addBreadcrumb: vi.fn() },
}))
vi.mock('@/stores/mmkv', () => {
  const storage = {
    getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => void disk.set(key, value),
    removeItem: (key: string) => void disk.delete(key),
  }
  return {
    hasMigratedFromAsyncStorage: () => true,
    isStorageLocked: () => false,
    MmkvStorage: storage,
    GuardedAsyncStorage: storage,
    PersistStorage: storage,
  }
})

const storage = createJSONStorage<Saved>(() => ({
  getItem: (key: string) => disk.get(key) ?? null,
  setItem: (key: string, value: string) => void disk.set(key, value),
  removeItem: (key: string) => void disk.delete(key),
}))

type Notes = { notes: string[]; add: (note: string) => void }

type Saved = Pick<Notes, 'notes'>

const createNotes = (options: Partial<PersistOptions<Notes, Saved>> = {}) =>
  create<Notes>()(
    persist<Notes, [], [], Saved>(
      (set) => ({
        notes: [],
        add: (note) => set(({ notes }) => ({ notes: [...notes, note] })),
      }),
      {
        name: 'notes',
        storage,
        version: 2,
        migrate: keepPersistedState,
        partialize: ({ notes }) => ({ notes }),
        ...options,
      }
    )
  )

const reports = async () => {
  await vi.waitFor(() => expect(captureException).toHaveBeenCalled())
  return captureException.mock.calls
}

const saved = (state: unknown, version: number) =>
  JSON.stringify({ state, version })

beforeEach(() => {
  disk.clear()
  captureException.mockClear()
})

describe('persist', () => {
  it('saves changes when the saved data loads', async () => {
    disk.set('notes', saved({ notes: ['a'] }, 2))
    const store = createNotes()
    expect(store.getState().notes).toEqual(['a'])
    store.getState().add('b')
    expect(JSON.parse(disk.get('notes')!)).toEqual({
      state: { notes: ['a', 'b'] },
      version: 2,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(captureException).not.toHaveBeenCalled()
  })

  it('saves after an outside read of the saved data', () => {
    disk.set('notes', saved({ notes: ['a'] }, 2))
    const store = createNotes()
    store.persist.getOptions().storage?.getItem('notes')
    store.getState().add('b')
    expect(JSON.parse(disk.get('notes')!).state.notes).toEqual(['a', 'b'])
  })

  it('saves a fresh install', () => {
    const store = createNotes()
    store.getState().add('a')
    expect(JSON.parse(disk.get('notes')!).state.notes).toEqual(['a'])
  })

  it('saves the migrated data as soon as it loads', () => {
    disk.set('notes', saved({ list: ['a'] }, 1))
    createNotes({
      migrate: (state) => ({ notes: (state as { list: string[] }).list }),
    })
    expect(JSON.parse(disk.get('notes')!)).toEqual({
      state: { notes: ['a'] },
      version: 2,
    })
  })

  it('keeps unreadable saved data', async () => {
    const blob = '{"state":{"notes":["a"'
    disk.set('notes', blob)
    const store = createNotes()
    store.getState().add('b')
    store.getState().add('c')
    expect(disk.get('notes')).toBe(blob)
    expect(store.getState().notes).toEqual(['b', 'c'])
    const [[error, properties], ...more] = await reports()
    expect(more).toEqual([])
    expect(error).toEqual(
      new Error('Kept the saved notes store: could not be loaded')
    )
    expect(properties).toEqual({
      storageKey: 'notes',
      reason: 'could not be loaded',
      version: 2,
      errorName: 'SyntaxError',
    })
  })

  it('keeps saved data whose migration throws', async () => {
    const blob = saved({ list: ['a'] }, 1)
    disk.set('notes', blob)
    const store = createNotes({
      migrate: () => {
        throw new Error('bad migration')
      },
    })
    store.getState().add('b')
    expect(disk.get('notes')).toBe(blob)
    expect(await reports()).toHaveLength(1)
  })

  it('keeps saved data whose merge throws', () => {
    const blob = saved({ notes: ['a'] }, 2)
    disk.set('notes', blob)
    const store = createNotes({
      merge: () => {
        throw new Error('bad merge')
      },
    })
    store.getState().add('b')
    expect(disk.get('notes')).toBe(blob)
  })

  it('loads data saved by a newer version as it is, and leaves it on disk', async () => {
    const blob = saved({ notes: ['a'], addedLater: true }, 3)
    disk.set('notes', blob)
    const migrate = vi.fn(keepPersistedState<Saved>)
    const store = createNotes({ migrate })
    expect(migrate).not.toHaveBeenCalled()
    expect(store.getState().notes).toEqual(['a'])
    store.getState().add('b')
    expect(disk.get('notes')).toBe(blob)
    const [[, properties], ...more] = await reports()
    expect(more).toEqual([])
    expect(properties).toMatchObject({
      reason: 'saved by a newer version',
      version: 2,
      savedVersion: 3,
    })
  })

  it('saves again once a later load succeeds', async () => {
    disk.set('notes', '{')
    const store = createNotes()
    store.getState().add('lost')
    expect(disk.get('notes')).toBe('{')
    disk.set('notes', saved({ notes: ['a'] }, 2))
    await store.persist.rehydrate()
    store.getState().add('b')
    expect(JSON.parse(disk.get('notes')!).state.notes).toEqual(['a', 'b'])
  })
})

describe('stores without migrations of their own', () => {
  it('keep Contacts saved by a newer version of the store', async () => {
    const blob = saved(
      {
        contacts: [{ id: 'keep', name: 'Ada', createdAt: '2026-01-01' }],
        deletedContacts: [],
      },
      1
    )
    disk.set('contacts', blob)
    const { default: useContacts } = await import('@/stores/contactsStore')
    expect(useContacts.getState().contacts.map(({ id }) => id)).toEqual([
      'keep',
    ])
    useContacts.setState({ customFieldDefs: [] })
    expect(disk.get('contacts')).toBe(blob)
  })
})
