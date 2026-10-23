import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory MMKV, one Map per id, so rows can be seeded the way Notes Import
// wrote them.
const mmkv = vi.hoisted(() => ({
  stores: new Map<string, Map<string, string>>(),
}))
vi.mock('react-native-mmkv', () => {
  class MMKV {
    private store: Map<string, string>
    constructor(options?: { id?: string }) {
      const id = options?.id ?? 'default'
      const existing = mmkv.stores.get(id)
      this.store = existing ?? new Map<string, string>()
      if (!existing) mmkv.stores.set(id, this.store)
    }
    getString(key: string): string | undefined {
      return this.store.get(key)
    }
    set(key: string, value: string): void {
      this.store.set(key, value)
    }
    contains(key: string): boolean {
      return this.store.has(key)
    }
    delete(key: string): void {
      this.store.delete(key)
    }
    getAllKeys(): string[] {
      return [...this.store.keys()]
    }
    clearAll(): void {
      this.store.clear()
    }
  }
  return { MMKV }
})
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios },
  AppState: { currentState: 'active', addEventListener: vi.fn() },
}))
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid',
  getRandomBytes: (count: number) => new Uint8Array(count),
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/contactAvatarFiles', () => ({
  deleteAvatarFiles: vi.fn(async () => {}),
}))

import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { PREFERENCE_DEFAULTS, usePreferences } from '@/stores/preferences'
import {
  writeMappedDataToStores,
  type ImportCommitResult,
} from '@/lib/import/writeMappedData'
import type { MappedImport } from '@/lib/import/types'
import {
  clearLegacyCommit,
  clearLegacyLedger,
  LEGACY_MAX_AGE_MS,
  legacyCommit,
  listLegacyImports,
  pruneLegacyLedger,
} from '@/features/scribe/legacy/notesImportLedger'
import { undoLegacyImport } from '@/features/scribe/legacy/undoLegacyImport'

const NOW = Date.UTC(2026, 9, 21, 12)
const DAY = 24 * 60 * 60 * 1000
const AT = new Date(NOW - 10 * DAY)

const ledger = () => {
  let store = mmkv.stores.get('notes-import-ledger')
  if (!store) {
    store = new Map()
    mmkv.stores.set('notes-import-ledger', store)
  }
  return store
}

/** A row as Notes Import saved it: JSON, so the commit's Dates are strings. */
const seed = (hash: string, row: Record<string, unknown> | string) =>
  ledger().set(
    `entry:${hash}`,
    typeof row === 'string' ? row : JSON.stringify({ hash, ...row })
  )

const row = (hash: string) => {
  const raw = ledger().get(`entry:${hash}`)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

const commitOf = (
  change: Partial<ImportCommitResult> = {}
): ImportCommitResult => ({
  insertedContactIds: ['c1', 'c2'],
  insertedVisitIds: ['v1'],
  insertedTimeEntries: [
    { id: 't1', hours: 1, minutes: 30, date: new Date('2026-10-11T12:00:00Z') },
  ],
  insertedCategoryIds: [],
  insertedCustomFieldDefIds: [],
  publisherChange: null,
  ...change,
})

/** One row in every state Notes Import left behind. */
function seedEveryKind() {
  // Current format, accepted.
  seed('done-new', {
    state: 'done',
    notesText: 'Maria Lopez\n12 Oak St',
    provisionalTitle: 'Maria Lopez',
    summary: 'Two return visits',
    result: { summary: 'Two return visits' },
    commit: commitOf(),
    createdAt: NOW - 5 * DAY,
    parsedAt: NOW - 5 * DAY,
    acceptedAt: NOW - 4 * DAY,
    updatedAt: NOW - 4 * DAY,
  })
  // Before `state`, `summary` and `updatedAt`: a commit means Done.
  seed('done-v1', {
    notesText: 'Ben Okafor came back',
    result: { summary: 'Ben’s visit' },
    commit: commitOf({
      insertedContactIds: ['c3'],
      insertedVisitIds: [],
      insertedTimeEntries: [],
    }),
    parsedAt: NOW - 20 * DAY,
    acceptedAt: NOW - 20 * DAY,
  })
  // Accepted, only the notes for a title.
  seed('done-untitled', {
    state: 'done',
    notesText: '\n  Talked with the Garcias  \nmore',
    commit: commitOf({ insertedContactIds: [], insertedVisitIds: [] }),
    acceptedAt: NOW - 2 * DAY,
    updatedAt: NOW - 2 * DAY,
  })
  seed('ready', {
    state: 'ready',
    notesText: 'Not accepted',
    result: { summary: 'Ready' },
    commit: null,
    updatedAt: NOW - DAY,
  })
  seed('working', {
    state: 'working',
    notesText: 'Still running',
    activeRun: { importId: 'run-1' },
    updatedAt: NOW - DAY,
  })
  seed('stopped', {
    state: 'stopped',
    notesText: 'Stopped',
    updatedAt: NOW - DAY,
  })
  seed('done-old', {
    state: 'done',
    notesText: 'Last year',
    summary: 'Old import',
    commit: commitOf(),
    acceptedAt: NOW - LEGACY_MAX_AGE_MS - DAY,
    updatedAt: NOW - LEGACY_MAX_AGE_MS - DAY,
  })
  seed('corrupt', '{"hash":')
  // Not a ledger row.
  ledger().set('meta:version', '2')
}

beforeEach(() => {
  // The ledger holds its instance for the run; empty it in place.
  for (const store of mmkv.stores.values()) store.clear()
  useContacts
    .getState()
    .set({ contacts: [], deletedContacts: [], customFieldDefs: [] })
  useConversations.getState()._WARNING_forceDeleteConversations()
  useServiceReport.getState()._WARNING_forceDeleteServiceReports()
  useCategories.getState()._WARNING_forceDeleteCategories()
  usePreferences.setState({ ...PREFERENCE_DEFAULTS, preferenceUpdatedAt: {} })
})

describe('listLegacyImports', () => {
  it('lists accepted imports from the last year, newest first', () => {
    seedEveryKind()
    expect(listLegacyImports(NOW)).toEqual([
      {
        id: 'done-untitled',
        title: 'Talked with the Garcias',
        acceptedAt: NOW - 2 * DAY,
        counts: { contacts: 0, visits: 0, timeEntries: 1 },
      },
      {
        id: 'done-new',
        title: 'Two return visits',
        acceptedAt: NOW - 4 * DAY,
        counts: { contacts: 2, visits: 1, timeEntries: 1 },
      },
      {
        id: 'done-v1',
        title: 'Ben’s visit',
        acceptedAt: NOW - 20 * DAY,
        counts: { contacts: 1, visits: 0, timeEntries: 0 },
      },
    ])
  })

  it('titles a row by its summary, then provisional title, then first line', () => {
    seed('a', {
      state: 'done',
      provisionalTitle: 'First line',
      summary: '  ',
      notesText: 'First line',
      commit: commitOf(),
      updatedAt: NOW,
      acceptedAt: NOW,
    })
    seed('b', {
      state: 'done',
      notesText: `${'x'.repeat(80)}\nsecond`,
      commit: commitOf(),
      updatedAt: NOW - 1,
      acceptedAt: NOW - 1,
    })
    const [a, b] = listLegacyImports(NOW)
    expect(a.title).toBe('First line')
    expect(b.title).toBe(`${'x'.repeat(59)}…`)
  })

  it('is empty without a ledger', () => {
    expect(listLegacyImports(NOW)).toEqual([])
  })
})

describe('legacyCommit', () => {
  it('revives the commit’s Dates', () => {
    seed('p', {
      state: 'done',
      commit: commitOf({
        publisherChange: {
          prevRole: 'publisher',
          prevTenure: new Date('2020-09-01T00:00:00Z'),
          prevRoleHistory: null,
        } as unknown as ImportCommitResult['publisherChange'],
      }),
      acceptedAt: NOW,
      updatedAt: NOW,
    })
    const commit = legacyCommit('p', NOW)
    expect(commit?.insertedTimeEntries[0].date).toBeInstanceOf(Date)
    expect(commit?.insertedTimeEntries[0].date.toISOString()).toBe(
      '2026-10-11T12:00:00.000Z'
    )
    expect(commit?.publisherChange?.prevTenure).toBeInstanceOf(Date)
  })

  it('is null for a row History can’t undo', () => {
    seedEveryKind()
    for (const id of [
      'ready',
      'working',
      'stopped',
      'done-old',
      'corrupt',
      'none',
    ])
      expect(legacyCommit(id, NOW)).toBeNull()
  })
})

describe('pruneLegacyLedger', () => {
  it('keeps only accepted imports from the last year', () => {
    seedEveryKind()
    expect(pruneLegacyLedger(NOW)).toBe(5)
    expect([...ledger().keys()].sort()).toEqual([
      'entry:done-new',
      'entry:done-untitled',
      'entry:done-v1',
      'meta:version',
    ])
    // The rows themselves are left as Notes Import wrote them.
    expect(row('done-v1')).not.toHaveProperty('state')
  })
})

describe('clearLegacyCommit', () => {
  it('returns the row to Ready with no commit', () => {
    seedEveryKind()
    clearLegacyCommit('done-new', NOW)
    expect(row('done-new')).toMatchObject({
      hash: 'done-new',
      state: 'ready',
      commit: null,
      acceptedAt: null,
      updatedAt: NOW,
      notesText: 'Maria Lopez\n12 Oak St',
      summary: 'Two return visits',
    })
    expect(listLegacyImports(NOW).map((item) => item.id)).not.toContain(
      'done-new'
    )
  })

  it('does nothing for a missing row', () => {
    clearLegacyCommit('none', NOW)
    expect(ledger().size).toBe(0)
  })
})

describe('clearLegacyLedger', () => {
  it('forgets every row', () => {
    seedEveryKind()
    clearLegacyLedger()
    expect(ledger().size).toBe(0)
  })
})

describe('undoLegacyImport', () => {
  const mapped = (): MappedImport => ({
    contacts: [
      { id: 'notes-maria', name: 'Maria', createdAt: AT },
      { id: 'notes-ben', name: 'Ben', createdAt: AT },
    ],
    visits: [
      {
        id: 'notes-visit-maria',
        contact: { id: 'notes-maria' },
        date: AT,
        isBibleStudy: false,
      },
      {
        id: 'notes-visit-ben',
        contact: { id: 'notes-ben' },
        date: AT,
        isBibleStudy: false,
      },
    ],
    timeEntries: [{ id: 'notes-time', hours: 1, minutes: 30, date: AT }],
    categories: [],
    customFieldDefs: [],
    publisher: null,
  })

  /** Accepts `mapped()` as Notes Import did, and saves its row. */
  const accept = (hash: string) => {
    const commit = writeMappedDataToStores(mapped(), {
      publisherMode: 'overwrite',
    })
    seed(hash, {
      state: 'done',
      notesText: 'Maria and Ben',
      summary: 'Maria and Ben',
      commit,
      acceptedAt: NOW - DAY,
      updatedAt: NOW - DAY,
    })
    return commit
  }

  const timeEntryIds = () =>
    Object.values(useServiceReport.getState().serviceReports).flatMap((year) =>
      Object.values(year).flatMap((month) => month.map((entry) => entry.id))
    )

  it('removes what the import added and clears the row', () => {
    accept('h1')
    expect(useContacts.getState().contacts).toHaveLength(2)

    expect(undoLegacyImport('h1', NOW)).toEqual({ status: 'undone', kept: 0 })
    expect(useContacts.getState().contacts).toHaveLength(0)
    expect(useConversations.getState().conversations).toHaveLength(0)
    expect(timeEntryIds()).toEqual([])
    expect(row('h1')).toMatchObject({
      state: 'ready',
      commit: null,
      acceptedAt: null,
    })
    expect(listLegacyImports(NOW)).toEqual([])
  })

  it('keeps a Contact another Visit still uses, and counts it', () => {
    accept('h1')
    useConversations.getState().addConversation({
      id: 'own-visit',
      contact: { id: 'notes-ben' },
      date: new Date(NOW),
      isBibleStudy: false,
    })

    expect(undoLegacyImport('h1', NOW)).toEqual({
      status: 'partially_undone',
      kept: 1,
    })
    expect(
      useContacts.getState().contacts.map((contact) => contact.id)
    ).toEqual(['notes-ben'])
    expect(
      useConversations.getState().conversations.map((visit) => visit.id)
    ).toEqual(['own-visit'])
  })

  it('has nothing to undo for an unknown or already undone import', () => {
    expect(undoLegacyImport('none', NOW)).toEqual({
      status: 'nothing_to_undo',
      kept: 0,
    })
    accept('h1')
    undoLegacyImport('h1', NOW)
    expect(undoLegacyImport('h1', NOW)).toEqual({
      status: 'nothing_to_undo',
      kept: 0,
    })
  })

  it('doesn’t undo an import older than a year', () => {
    accept('h1')
    expect(undoLegacyImport('h1', NOW + LEGACY_MAX_AGE_MS + DAY)).toEqual({
      status: 'nothing_to_undo',
      kept: 0,
    })
    expect(useContacts.getState().contacts).toHaveLength(2)
  })
})
