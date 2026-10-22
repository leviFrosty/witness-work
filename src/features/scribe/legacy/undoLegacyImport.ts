import useContacts from '@/stores/contactsStore'
import { undoImport } from '@/lib/import/writeMappedData'
import type { ScribeUndoResult } from '@/features/scribe/types'
import {
  clearLegacyCommit,
  legacyCommit,
} from '@/features/scribe/legacy/notesImportLedger'

/**
 * Undo an accepted Notes Import: `undoImport` deletes what it inserted (a
 * Contact another Visit still uses stays, `kept`), then the row returns to
 * Ready with no commit, as Notes Import's own Undo left it.
 */
export function undoLegacyImport(
  id: string,
  now: number = Date.now()
): ScribeUndoResult {
  const commit = legacyCommit(id, now)
  if (!commit) return { status: 'nothing_to_undo', kept: 0 }
  const before = new Set(
    useContacts.getState().contacts.map((contact) => contact.id)
  )
  const present = commit.insertedContactIds.filter((contactId) =>
    before.has(contactId)
  )
  undoImport(commit)
  const after = new Set(
    useContacts.getState().contacts.map((contact) => contact.id)
  )
  const kept = present.filter((contactId) => after.has(contactId)).length
  clearLegacyCommit(id, now)
  return { status: kept > 0 ? 'partially_undone' : 'undone', kept }
}
