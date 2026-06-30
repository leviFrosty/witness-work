import { MMKV } from 'react-native-mmkv'
import {
  normalizeNotesImportCredits,
  type NotesImportCredits,
} from '@/features/notes-import/lib/notesImportUsage'

/**
 * Durable last-known credit snapshot for the usage meter. The manager only
 * learns the live credits when a run COMPLETES, and holds them in volatile
 * store state — so without this the meter is blank during a fresh
 * conversation's first run and again after every app restart (the "appears
 * sometimes" bug). Persisting the latest snapshot lets the meter show on any
 * initiated conversation immediately; the next completed run refreshes it.
 *
 * Lazy MMKV (matches the ledger) so importing this module never constructs
 * native storage — node-based unit tests that touch the pure usage helpers stay
 * clear of it.
 */
let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'notes-import-credits' }))

const KEY = 'credits'

/**
 * The persisted snapshot, re-normalized on read so a blob written by an older
 * usage contract is healed the same way a stale network response is. Null when
 * nothing is stored yet or the record is unparseable.
 */
export const loadPersistedCredits = (): NotesImportCredits | null => {
  const raw = store().getString(KEY)
  if (!raw) return null
  try {
    return normalizeNotesImportCredits(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Records the latest credit snapshot from a completed run. */
export const persistCredits = (credits: NotesImportCredits): void => {
  store().set(KEY, JSON.stringify(credits))
}
