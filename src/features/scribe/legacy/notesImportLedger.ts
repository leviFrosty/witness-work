import { MMKV } from 'react-native-mmkv'
import type { ImportCommitResult } from '@/lib/import/writeMappedData'
import type { ScribeLegacyImport } from '@/features/scribe/types'

interface LegacyLedgerRow {
  hash: string
  state?: 'working' | 'ready' | 'done' | 'stopped'
  summary?: string
  provisionalTitle?: string
  notesText?: string

  result?: { summary?: unknown } | null
  commit?: ImportCommitResult | null
  acceptedAt?: number | null
  createdAt?: number
  parsedAt?: number | null
  updatedAt?: number
}

export const LEGACY_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000
const KEY_PREFIX = 'entry:'
const TITLE_MAX = 60

let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'notes-import-ledger' }))

function parseRow(raw: string | undefined): LegacyLedgerRow | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const row = value as LegacyLedgerRow
    return typeof row.hash === 'string' ? row : null
  } catch {
    return null
  }
}

const stateOf = (row: LegacyLedgerRow): LegacyLedgerRow['state'] =>
  row.state ??
  (row.acceptedAt != null || row.commit
    ? 'done'
    : row.parsedAt
      ? 'ready'
      : 'working')

const updatedAtOf = (row: LegacyLedgerRow): number =>
  row.updatedAt ?? row.acceptedAt ?? row.parsedAt ?? row.createdAt ?? 0

function firstLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    return trimmed.length > TITLE_MAX
      ? `${trimmed.slice(0, TITLE_MAX - 1).trimEnd()}…`
      : trimmed
  }
  return ''
}

const titleOf = (row: LegacyLedgerRow): string =>
  row.summary?.trim() ||
  (typeof row.result?.summary === 'string' ? row.result.summary.trim() : '') ||
  row.provisionalTitle ||
  firstLine(row.notesText ?? '')

const undoableRow = (row: LegacyLedgerRow, now: number): boolean =>
  stateOf(row) === 'done' &&
  !!row.commit &&
  now - updatedAtOf(row) <= LEGACY_MAX_AGE_MS

function rows(): { key: string; row: LegacyLedgerRow | null }[] {
  const mmkv = store()
  return mmkv
    .getAllKeys()
    .filter((key) => key.startsWith(KEY_PREFIX))
    .map((key) => ({ key, row: parseRow(mmkv.getString(key)) }))
}

const reviveCommit = (commit: ImportCommitResult): ImportCommitResult => ({
  ...commit,
  insertedTimeEntries: commit.insertedTimeEntries.map((entry) => ({
    ...entry,
    date: new Date(entry.date),
  })),
  publisherChange: commit.publisherChange
    ? {
        ...commit.publisherChange,
        prevTenure: commit.publisherChange.prevTenure
          ? new Date(commit.publisherChange.prevTenure)
          : null,
      }
    : null,
})

export function listLegacyImports(
  now: number = Date.now()
): ScribeLegacyImport[] {
  return rows()
    .flatMap(({ row }) =>
      row && row.commit && undoableRow(row, now)
        ? [
            {
              id: row.hash,
              title: titleOf(row),
              acceptedAt: row.acceptedAt ?? updatedAtOf(row),
              counts: {
                contacts: row.commit.insertedContactIds.length,
                visits: row.commit.insertedVisitIds.length,
                timeEntries: row.commit.insertedTimeEntries.length,
              },
            },
          ]
        : []
    )
    .sort((a, b) => b.acceptedAt - a.acceptedAt)
}

export function legacyCommit(
  id: string,
  now: number = Date.now()
): ImportCommitResult | null {
  const row = parseRow(store().getString(`${KEY_PREFIX}${id}`))
  return row?.commit && undoableRow(row, now) ? reviveCommit(row.commit) : null
}

export function clearLegacyCommit(id: string, now: number = Date.now()): void {
  const key = `${KEY_PREFIX}${id}`
  const row = parseRow(store().getString(key))
  if (!row) return
  store().set(
    key,
    JSON.stringify({
      ...row,
      state: 'ready',
      commit: null,
      acceptedAt: null,
      updatedAt: now,
    })
  )
}

export function pruneLegacyLedger(now: number = Date.now()): number {
  let removed = 0
  for (const { key, row } of rows()) {
    if (row && undoableRow(row, now)) continue
    store().delete(key)
    removed++
  }
  return removed
}

export const clearLegacyLedger = (): void => store().clearAll()
