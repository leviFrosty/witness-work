import { MMKV } from 'react-native-mmkv'
import { logger } from '@/lib/logger'
import { pruneLegacyLedger } from '@/features/scribe/legacy/notesImportLedger'

/**
 * Launch cleanup of what Notes Import left: its Import Credits cache (MMKV
 * `notes-import-credits`; Scribe AI meters on the server) and ledger rows
 * History can't undo. Idempotent, so it simply runs every launch.
 */
export function cleanUpNotesImport(now: number = Date.now()): void {
  try {
    const credits = new MMKV({ id: 'notes-import-credits' })
    if (credits.getAllKeys().length > 0) credits.clearAll()
    pruneLegacyLedger(now)
  } catch (error) {
    logger.warn('[scribe] Notes Import cleanup failed', error)
  }
}
