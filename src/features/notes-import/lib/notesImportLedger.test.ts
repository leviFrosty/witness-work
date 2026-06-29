import { beforeEach, describe, it, expect, vi } from 'vitest'

// In-memory MMKV so the real ledger functions run under node (vitest). One
// backing Map per `new MMKV({ id })`; the ledger holds a single lazy instance,
// so state persists across a test file and is cleared in beforeEach.
vi.mock('react-native-mmkv', () => {
  class MMKV {
    private store = new Map<string, string>()
    constructor(_opts?: { id?: string }) {}
    getString(k: string): string | undefined {
      return this.store.get(k)
    }
    set(k: string, v: string): void {
      this.store.set(k, v)
    }
    contains(k: string): boolean {
      return this.store.has(k)
    }
    delete(k: string): void {
      this.store.delete(k)
    }
    getAllKeys(): string[] {
      return [...this.store.keys()]
    }
  }
  return { MMKV }
})

import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'
import type { ImportCommitResult } from '@/lib/import/writeMappedData'
import {
  provisionalTitleFromNotes,
  ledgerEntryTitle,
  readyImportCount,
  isUnviewedReady,
  unviewedReadyImportCount,
  markViewed,
  markViewedTransition,
  migrateLedgerEntry,
  isPrunableLedgerEntry,
  getLedgerEntry,
  getAllLedgerEntries,
  hasLedgerEntry,
  beginWorkingEntry,
  setActiveRun,
  appendLedgerHistory,
  putParsedResult,
  markAccepted,
  clearAccepted,
  deleteLedgerEntry,
  clearCompletedLedgerEntries,
  pruneLedgerEntries,
  beginWorkingTransition,
  putParsedTransition,
  markAcceptedTransition,
  clearAcceptedTransition,
  stoppedTransition,
  setActiveRunTransition,
  LEDGER_MAX_AGE_MS,
  type NotesImportLedgerEntry,
} from '@/features/notes-import/lib/notesImportLedger'

const result = (over: Partial<NotesImportResult> = {}): NotesImportResult => ({
  contacts: [],
  visits: [],
  timeEntries: [],
  categories: [],
  publisher: null,
  warnings: [],
  summary: 'Tuesday cart witnessing',
  assistantMessage: '',
  ...over,
})

const commit = (): ImportCommitResult => ({
  insertedContactIds: ['c1'],
  insertedVisitIds: ['v1'],
  insertedTimeEntries: [
    // date intentionally a real Date so the revive round-trip is exercised
    { id: 't1', hours: 1, minutes: 0, date: new Date('2026-06-01T12:00:00Z') },
  ] as ImportCommitResult['insertedTimeEntries'],
  insertedCategoryIds: [],
  insertedCustomFieldDefIds: [],
  publisherChange: null,
})

beforeEach(() => {
  for (const e of getAllLedgerEntries()) deleteLedgerEntry(e.hash)
})

describe('provisionalTitleFromNotes', () => {
  it('takes the first non-empty trimmed line', () => {
    expect(provisionalTitleFromNotes('\n\n  Visited Maria  \nrest')).toBe(
      'Visited Maria'
    )
  })

  it('truncates a long first line with an ellipsis', () => {
    const long = 'x'.repeat(80)
    const title = provisionalTitleFromNotes(long)
    expect(title.length).toBeLessThanOrEqual(60)
    expect(title.endsWith('…')).toBe(true)
  })

  it('returns empty string for blank notes', () => {
    expect(provisionalTitleFromNotes('   \n  ')).toBe('')
  })
})

describe('ledgerEntryTitle', () => {
  const base: NotesImportLedgerEntry = {
    hash: 'h',
    state: 'ready',
    notesText: 'Visited Maria',
    provisionalTitle: 'Visited Maria',
    result: result(),
    history: [],
    summary: 'Three return visits',
    commit: null,
    activeRun: null,
    createdAt: 1,
    parsedAt: 2,
    viewedAt: null,
    acceptedAt: null,
    updatedAt: 2,
  }

  it('prefers the summary once past Working', () => {
    expect(ledgerEntryTitle(base)).toBe('Three return visits')
  })

  it('uses the provisional title while Working', () => {
    expect(ledgerEntryTitle({ ...base, state: 'working' })).toBe(
      'Visited Maria'
    )
  })

  it('falls back to the provisional title when the summary is empty', () => {
    expect(ledgerEntryTitle({ ...base, summary: '' })).toBe('Visited Maria')
  })
})

describe('migrateLedgerEntry', () => {
  it('derives Done/Ready/Working state for a pre-history (v1) record', () => {
    const ready = migrateLedgerEntry(
      {
        hash: 'a',
        result: result({ summary: '' }),
        commit: null,
        parsedAt: 10,
        acceptedAt: null,
      },
      100
    )
    expect(ready?.state).toBe('ready')
    expect(ready?.notesText).toBe('')
    expect(ready?.createdAt).toBe(10)

    const done = migrateLedgerEntry(
      {
        hash: 'b',
        result: result(),
        commit: commit(),
        parsedAt: 10,
        acceptedAt: 20,
      },
      100
    )
    expect(done?.state).toBe('done')

    const working = migrateLedgerEntry({ hash: 'c', result: null }, 100)
    expect(working?.state).toBe('working')
    expect(working?.createdAt).toBe(100)
  })

  it('surfaces result.summary when the row has no explicit summary', () => {
    const e = migrateLedgerEntry(
      { hash: 'a', result: result({ summary: 'June time + 2 studies' }) },
      1
    )
    expect(e?.summary).toBe('June time + 2 studies')
  })

  it('rejects a record with no hash', () => {
    expect(migrateLedgerEntry({ result: null }, 1)).toBeNull()
    expect(migrateLedgerEntry(null, 1)).toBeNull()
  })

  it('keeps a valid activeRun and drops a malformed one', () => {
    const ok = migrateLedgerEntry(
      { hash: 'a', activeRun: { importId: 'i', subscribeToken: 's' } },
      1
    )
    expect(ok?.activeRun).toEqual({ importId: 'i', subscribeToken: 's' })
    const bad = migrateLedgerEntry(
      { hash: 'a', activeRun: { importId: 'i' } },
      1
    )
    expect(bad?.activeRun).toBeNull()
  })

  it('drops a stray activeRun on a non-Working (Ready) row', () => {
    const e = migrateLedgerEntry(
      {
        hash: 'a',
        result: result(),
        activeRun: { importId: 'i', subscribeToken: 's' },
      },
      1
    )
    expect(e?.state).toBe('ready')
    expect(e?.activeRun).toBeNull()
  })
})

describe('isPrunableLedgerEntry', () => {
  const entry = (updatedAt: number): NotesImportLedgerEntry =>
    migrateLedgerEntry({ hash: 'h', updatedAt }, 0)!

  it('prunes rows older than the max age', () => {
    const now = LEDGER_MAX_AGE_MS * 2
    expect(isPrunableLedgerEntry(entry(0), now)).toBe(true)
    expect(isPrunableLedgerEntry(entry(now - 1000), now)).toBe(false)
  })
})

describe('ledger lifecycle transitions (pure)', () => {
  // A Ready row carrying a cached result + thread, used as the "existing" input.
  const readyEntry = (
    over: Partial<NotesImportLedgerEntry> = {}
  ): NotesImportLedgerEntry => ({
    hash: 'h',
    state: 'ready',
    notesText: 'Visited Maria\nmore',
    provisionalTitle: 'Visited Maria',
    result: result({ summary: 'Maria visit' }),
    history: [{ role: 'assistant', text: 'reply 0', at: 5 }],
    summary: 'Maria visit',
    commit: null,
    activeRun: null,
    createdAt: 10,
    parsedAt: 20,
    viewedAt: null,
    acceptedAt: null,
    updatedAt: 20,
    ...over,
  })

  describe('beginWorkingTransition', () => {
    it('on null creates a fresh Working row (createdAt = nowMs, no result/commit)', () => {
      const e = beginWorkingTransition(null, {
        notesText: 'Visited Maria\nrest',
        activeRun: { importId: 'i', subscribeToken: 's' },
        nowMs: 1000,
      })
      expect(e.state).toBe('working')
      expect(e.notesText).toBe('Visited Maria\nrest')
      expect(e.provisionalTitle).toBe('Visited Maria')
      expect(e.result).toBeNull()
      expect(e.commit).toBeNull()
      expect(e.acceptedAt).toBeNull()
      expect(e.parsedAt).toBeNull()
      expect(e.history).toEqual([])
      expect(e.createdAt).toBe(1000)
      expect(e.updatedAt).toBe(1000)
      expect(e.activeRun).toEqual({ importId: 'i', subscribeToken: 's' })
    })

    it('re-opening a Ready row (refine) flips to Working but PRESERVES result/summary/history/createdAt', () => {
      const existing = readyEntry({
        commit: commit(),
        acceptedAt: 30,
        state: 'done',
      })
      const e = beginWorkingTransition(existing, {
        notesText: 'Visited Maria\nmore',
        activeRun: { importId: 'i2', subscribeToken: 't2' },
        nowMs: 50,
      })
      expect(e.state).toBe('working')
      // Refinement base preserved verbatim.
      expect(e.result).toBe(existing.result)
      expect(e.summary).toBe('Maria visit')
      expect(e.history).toBe(existing.history)
      expect(e.commit).toBe(existing.commit)
      expect(e.acceptedAt).toBe(30)
      expect(e.parsedAt).toBe(20)
      expect(e.createdAt).toBe(10) // original kept
      // Refreshed fields.
      expect(e.activeRun).toEqual({ importId: 'i2', subscribeToken: 't2' })
      expect(e.updatedAt).toBe(50)
      expect(e.provisionalTitle).toBe('Visited Maria')
    })

    it('does not mutate the input entry', () => {
      const existing = readyEntry()
      const snapshot = JSON.stringify(existing)
      beginWorkingTransition(existing, {
        notesText: 'x',
        activeRun: null,
        nowMs: 99,
      })
      expect(JSON.stringify(existing)).toBe(snapshot)
    })
  })

  describe('putParsedTransition', () => {
    it('on a row that had a commit → Ready with commit forced null, activeRun null, summary from result', () => {
      const existing = readyEntry({
        state: 'done',
        commit: commit(),
        acceptedAt: 30,
        activeRun: { importId: 'i', subscribeToken: 's' },
      })
      const e = putParsedTransition(
        existing,
        result({ summary: 'New sum' }),
        60
      )
      expect(e.state).toBe('ready')
      expect(e.commit).toBeNull()
      expect(e.acceptedAt).toBeNull()
      expect(e.activeRun).toBeNull()
      expect(e.summary).toBe('New sum')
      expect(e.parsedAt).toBe(60)
      expect(e.updatedAt).toBe(60)
      expect(e.createdAt).toBe(10) // preserved
      expect(e.history).toBe(existing.history) // thread persists
    })

    it('falls back to existing.summary when the result omits one', () => {
      const existing = readyEntry({ summary: 'Kept summary' })
      const e = putParsedTransition(
        existing,
        result({ summary: undefined as unknown as string }),
        60
      )
      expect(e.summary).toBe('Kept summary')
    })

    it('on null creates a fresh Ready row (legacy single-shot path)', () => {
      const e = putParsedTransition(null, result({ summary: 'S' }), 70)
      expect(e.state).toBe('ready')
      expect(e.result).not.toBeNull()
      expect(e.commit).toBeNull()
      expect(e.notesText).toBe('')
      expect(e.history).toEqual([])
      expect(e.createdAt).toBe(70)
      expect(e.parsedAt).toBe(70)
    })
  })

  describe('markAcceptedTransition', () => {
    it('moves to Done, sets commit + acceptedAt, preserves the result', () => {
      const existing = readyEntry()
      const c = commit()
      const e = markAcceptedTransition(existing, c, 80)
      expect(e.state).toBe('done')
      expect(e.commit).toBe(c)
      expect(e.acceptedAt).toBe(80)
      expect(e.updatedAt).toBe(80)
      expect(e.result).toBe(existing.result)
      // input untouched
      expect(existing.state).toBe('ready')
      expect(existing.commit).toBeNull()
    })
  })

  describe('clearAcceptedTransition', () => {
    it('returns to Ready, clears commit + acceptedAt, keeps the result', () => {
      const existing = readyEntry({
        state: 'done',
        commit: commit(),
        acceptedAt: 80,
      })
      const e = clearAcceptedTransition(existing, 90)
      expect(e.state).toBe('ready')
      expect(e.commit).toBeNull()
      expect(e.acceptedAt).toBeNull()
      expect(e.updatedAt).toBe(90)
      expect(e.result).toBe(existing.result)
    })
  })

  describe('stoppedTransition', () => {
    it('parks a Working row in stopped, clearing activeRun + keeping notes/history', () => {
      const existing = readyEntry({
        state: 'working',
        result: null,
        activeRun: { importId: 'i', subscribeToken: 's' },
      })
      const e = stoppedTransition(existing, 120)
      expect(e.state).toBe('stopped')
      expect(e.activeRun).toBeNull()
      expect(e.notesText).toBe(existing.notesText)
      expect(e.history).toBe(existing.history)
      expect(e.updatedAt).toBe(120)
    })

    it('is a no-op (same reference) once the row already has a result', () => {
      const ready = readyEntry()
      expect(stoppedTransition(ready, 130)).toBe(ready)
      const done = readyEntry({
        state: 'done',
        commit: commit(),
        acceptedAt: 80,
      })
      expect(stoppedTransition(done, 130)).toBe(done)
    })
  })

  describe('setActiveRunTransition', () => {
    it('updates only activeRun + updatedAt', () => {
      const existing = readyEntry({ updatedAt: 20 })
      const run = { importId: 'x', subscribeToken: 'y' }
      const e = setActiveRunTransition(existing, run, 100)
      expect(e.activeRun).toBe(run)
      expect(e.updatedAt).toBe(100)
      // everything else identical
      expect({ ...e, activeRun: null, updatedAt: 20 }).toEqual({
        ...existing,
        activeRun: null,
      })
      expect(setActiveRunTransition(existing, null, 101).activeRun).toBeNull()
    })
  })
})

describe('ledger lifecycle (store-backed)', () => {
  it('walks Working → Ready → Done → (undo) Ready', () => {
    beginWorkingEntry('h1', {
      notesText: 'Visited Maria\nmore',
      activeRun: { importId: 'imp', subscribeToken: 'tok' },
      nowMs: 1000,
    })
    let e = getLedgerEntry('h1')!
    expect(e.state).toBe('working')
    expect(e.notesText).toBe('Visited Maria\nmore')
    expect(e.provisionalTitle).toBe('Visited Maria')
    expect(e.activeRun).toEqual({ importId: 'imp', subscribeToken: 'tok' })
    expect(e.createdAt).toBe(1000)

    putParsedResult('h1', result({ summary: 'Maria visit' }), 2000)
    e = getLedgerEntry('h1')!
    expect(e.state).toBe('ready')
    expect(e.summary).toBe('Maria visit')
    expect(e.activeRun).toBeNull() // slot released
    expect(e.notesText).toBe('Visited Maria\nmore') // preserved
    expect(e.createdAt).toBe(1000) // preserved

    markAccepted('h1', commit(), 3000)
    e = getLedgerEntry('h1')!
    expect(e.state).toBe('done')
    expect(e.acceptedAt).toBe(3000)
    expect(e.commit?.insertedContactIds).toEqual(['c1'])
    // Commit Date fields are revived on read.
    expect(e.commit?.insertedTimeEntries[0].date).toBeInstanceOf(Date)

    clearAccepted('h1', 4000)
    e = getLedgerEntry('h1')!
    expect(e.state).toBe('ready')
    expect(e.commit).toBeNull()
    expect(e.acceptedAt).toBeNull()
  })

  it('a new parse clears any prior commit (Ready ⟹ unaccepted)', () => {
    beginWorkingEntry('hx', { notesText: 'n', activeRun: null, nowMs: 1 })
    putParsedResult('hx', result(), 2)
    markAccepted('hx', commit(), 3)
    expect(getLedgerEntry('hx')!.commit).not.toBeNull()
    // A fresh result landing must reset the row to an unaccepted Ready state.
    putParsedResult('hx', result(), 4)
    const e = getLedgerEntry('hx')!
    expect(e.state).toBe('ready')
    expect(e.commit).toBeNull()
    expect(e.acceptedAt).toBeNull()
  })

  it('re-opening a Ready row for a refinement preserves createdAt + result', () => {
    beginWorkingEntry('h2', { notesText: 'notes', activeRun: null, nowMs: 10 })
    putParsedResult('h2', result(), 20)
    beginWorkingEntry('h2', {
      notesText: 'notes',
      activeRun: { importId: 'i2', subscribeToken: 't2' },
      nowMs: 30,
    })
    const e = getLedgerEntry('h2')!
    expect(e.state).toBe('working')
    expect(e.createdAt).toBe(10)
    expect(e.result).not.toBeNull() // kept as a refinement base
    expect(e.activeRun).toEqual({ importId: 'i2', subscribeToken: 't2' })
  })

  it('accumulates the conversation thread across refinements', () => {
    beginWorkingEntry('hc', { notesText: 'notes', activeRun: null, nowMs: 1 })
    putParsedResult('hc', result(), 2)
    // Refine round 1: the prior reply + the new instruction seal into history.
    appendLedgerHistory(
      'hc',
      [
        { role: 'assistant', text: 'reply 0', at: 3 },
        { role: 'user', text: 'add Maria', at: 3 },
      ],
      3
    )
    beginWorkingEntry('hc', { notesText: 'notes', activeRun: null, nowMs: 3 })
    // The new reply lands; history must survive the re-parse.
    putParsedResult('hc', result(), 4)
    expect(getLedgerEntry('hc')!.history).toEqual([
      { role: 'assistant', text: 'reply 0', at: 3 },
      { role: 'user', text: 'add Maria', at: 3 },
    ])
    // Refine round 2 appends to (not replaces) the thread.
    appendLedgerHistory(
      'hc',
      [
        { role: 'assistant', text: 'reply 1', at: 5 },
        { role: 'user', text: 'drop the time', at: 5 },
      ],
      5
    )
    expect(getLedgerEntry('hc')!.history.map((m) => m.text)).toEqual([
      'reply 0',
      'add Maria',
      'reply 1',
      'drop the time',
    ])
  })

  it('appendLedgerHistory no-ops on an empty list or a missing row', () => {
    beginWorkingEntry('he', { notesText: 'n', activeRun: null, nowMs: 1 })
    appendLedgerHistory('he', [], 2)
    expect(getLedgerEntry('he')!.history).toEqual([])
    appendLedgerHistory('gone', [{ role: 'user', text: 'x', at: 1 }], 2)
    expect(getLedgerEntry('gone')).toBeNull()
  })

  it('setActiveRun updates only the run handle', () => {
    beginWorkingEntry('h3', { notesText: 'n', activeRun: null, nowMs: 1 })
    setActiveRun('h3', { importId: 'x', subscribeToken: 'y' }, 2)
    expect(getLedgerEntry('h3')!.activeRun).toEqual({
      importId: 'x',
      subscribeToken: 'y',
    })
    setActiveRun('h3', null, 3)
    expect(getLedgerEntry('h3')!.activeRun).toBeNull()
  })
})

describe('ledger list operations', () => {
  it('lists newest-first and reports membership', () => {
    beginWorkingEntry('old', { notesText: 'a', activeRun: null, nowMs: 100 })
    beginWorkingEntry('new', { notesText: 'b', activeRun: null, nowMs: 200 })
    const all = getAllLedgerEntries()
    expect(all.map((e) => e.hash)).toEqual(['new', 'old'])
    expect(hasLedgerEntry('old')).toBe(true)
    expect(hasLedgerEntry('missing')).toBe(false)
  })

  it('deletes a single row without touching others', () => {
    beginWorkingEntry('keep', { notesText: 'a', activeRun: null, nowMs: 1 })
    beginWorkingEntry('drop', { notesText: 'b', activeRun: null, nowMs: 2 })
    deleteLedgerEntry('drop')
    expect(getLedgerEntry('drop')).toBeNull()
    expect(getLedgerEntry('keep')).not.toBeNull()
  })

  it('clears only completed (Done) rows', () => {
    beginWorkingEntry('working', { notesText: 'a', activeRun: null, nowMs: 1 })
    beginWorkingEntry('ready', { notesText: 'b', activeRun: null, nowMs: 2 })
    putParsedResult('ready', result(), 3)
    beginWorkingEntry('done', { notesText: 'c', activeRun: null, nowMs: 4 })
    putParsedResult('done', result(), 5)
    markAccepted('done', commit(), 6)

    expect(clearCompletedLedgerEntries()).toBe(1)
    expect(getLedgerEntry('done')).toBeNull()
    expect(getLedgerEntry('ready')).not.toBeNull()
    expect(getLedgerEntry('working')).not.toBeNull()
  })

  it('prunes rows older than the max age by updatedAt', () => {
    const now = LEDGER_MAX_AGE_MS * 3
    beginWorkingEntry('stale', { notesText: 'a', activeRun: null, nowMs: 1 })
    beginWorkingEntry('fresh', {
      notesText: 'b',
      activeRun: null,
      nowMs: now - 1000,
    })
    expect(pruneLedgerEntries(now)).toBe(1)
    expect(getLedgerEntry('stale')).toBeNull()
    expect(getLedgerEntry('fresh')).not.toBeNull()
  })
})

describe('readyImportCount', () => {
  const entry = (
    state: NotesImportLedgerEntry['state']
  ): NotesImportLedgerEntry => ({
    hash: `h-${Math.random()}`,
    state,
    notesText: 'n',
    provisionalTitle: 'n',
    result: result(),
    history: [],
    summary: '',
    commit: null,
    activeRun: null,
    createdAt: 1,
    parsedAt: 2,
    viewedAt: null,
    acceptedAt: null,
    updatedAt: 2,
  })

  it('counts only ready entries', () => {
    expect(
      readyImportCount([
        entry('ready'),
        entry('ready'),
        entry('working'),
        entry('done'),
      ])
    ).toBe(2)
  })

  it('is zero for an empty ledger', () => {
    expect(readyImportCount([])).toBe(0)
  })
})

describe('viewed / unread dot', () => {
  const entry = (
    over: Partial<NotesImportLedgerEntry> = {}
  ): NotesImportLedgerEntry => ({
    hash: `h-${Math.random()}`,
    state: 'ready',
    notesText: 'n',
    provisionalTitle: 'n',
    result: result(),
    history: [],
    summary: '',
    commit: null,
    activeRun: null,
    createdAt: 1,
    parsedAt: 20,
    viewedAt: null,
    acceptedAt: null,
    updatedAt: 20,
    ...over,
  })

  describe('isUnviewedReady', () => {
    it('is true for a never-viewed Ready row', () => {
      expect(isUnviewedReady(entry({ viewedAt: null }))).toBe(true)
    })

    it('is false once viewed at/after the parse', () => {
      expect(isUnviewedReady(entry({ viewedAt: 20 }))).toBe(false)
      expect(isUnviewedReady(entry({ viewedAt: 25 }))).toBe(false)
    })

    it('re-arms when a refinement re-parses after the last view', () => {
      // Viewed at 20, then refined → new parsedAt 30: unread again.
      expect(isUnviewedReady(entry({ viewedAt: 20, parsedAt: 30 }))).toBe(true)
    })

    it('is false for non-Ready rows regardless of viewedAt', () => {
      expect(isUnviewedReady(entry({ state: 'working', viewedAt: null }))).toBe(
        false
      )
      expect(isUnviewedReady(entry({ state: 'done', viewedAt: null }))).toBe(
        false
      )
    })
  })

  describe('unviewedReadyImportCount', () => {
    it('counts only unread Ready rows', () => {
      expect(
        unviewedReadyImportCount([
          entry({ viewedAt: null }), // unread
          entry({ viewedAt: 25 }), // viewed
          entry({ state: 'working' }),
          entry({ state: 'done' }),
        ])
      ).toBe(1)
    })
  })

  describe('markViewedTransition', () => {
    it('stamps viewedAt + updatedAt on an unread Ready row', () => {
      const e = markViewedTransition(entry({ viewedAt: null }), 50)
      expect(e.viewedAt).toBe(50)
      expect(e.updatedAt).toBe(50)
    })

    it('returns the SAME reference when nothing changes', () => {
      const viewed = entry({ viewedAt: 25 })
      expect(markViewedTransition(viewed, 50)).toBe(viewed)
      const working = entry({ state: 'working' })
      expect(markViewedTransition(working, 50)).toBe(working)
    })
  })

  describe('markViewed (store-backed)', () => {
    it('clears the unread dot for a Ready row and reports the change', () => {
      beginWorkingEntry('hv', {
        notesText: 'Visited Maria',
        activeRun: null,
        nowMs: 1000,
      })
      putParsedResult('hv', result({ summary: 'S' }), 2000)
      expect(isUnviewedReady(getLedgerEntry('hv')!)).toBe(true)

      expect(markViewed('hv', 3000)).toBe(true)
      expect(getLedgerEntry('hv')!.viewedAt).toBe(3000)
      expect(isUnviewedReady(getLedgerEntry('hv')!)).toBe(false)

      // Idempotent: a second view changes nothing.
      expect(markViewed('hv', 4000)).toBe(false)
      expect(getLedgerEntry('hv')!.viewedAt).toBe(3000)
    })

    it('re-arms the dot after a refinement re-parses, clears on next view', () => {
      beginWorkingEntry('hr', {
        notesText: 'Visited Maria',
        activeRun: null,
        nowMs: 1000,
      })
      putParsedResult('hr', result(), 2000)
      markViewed('hr', 2500)
      expect(isUnviewedReady(getLedgerEntry('hr')!)).toBe(false)

      // A refinement re-opens Working then re-parses with a newer parsedAt.
      beginWorkingEntry('hr', {
        notesText: 'Visited Maria',
        activeRun: null,
        nowMs: 3000,
      })
      putParsedResult('hr', result({ summary: 'refined' }), 3500)
      expect(isUnviewedReady(getLedgerEntry('hr')!)).toBe(true)

      expect(markViewed('hr', 4000)).toBe(true)
      expect(isUnviewedReady(getLedgerEntry('hr')!)).toBe(false)
    })

    it('is a no-op for a missing row', () => {
      expect(markViewed('nope', 1)).toBe(false)
    })
  })
})
