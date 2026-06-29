import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  mapNotesImport,
  type MappedNotesImport,
} from '@/features/notes-import/lib/mapNotesImport'
import {
  buildNotesImportPreview,
  setGroupSelection,
  setRowsSelection,
  togglePublisherSelection,
  toggleRowSelection,
  type NotesImportPreview,
  type PreviewKind,
  type PreviewSelection,
} from '@/features/notes-import/lib/buildNotesImportPreview'
import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'

/**
 * Builds the preview view-model + an editable selection for a single import's
 * result, on the Detail screen. Mirrors the selection half of the legacy
 * `useNotesImport`, but driven by a ledger result rather than in-flight network
 * state. Record ids are hash-derived, so the selection stays valid across the
 * separate `mapNotesImport` call the manager makes at Accept.
 *
 * The selection RESET keys on `(contentHash, resultToken)` — NOT the `result`
 * object reference. The manager's `hydrate()` rebuilds every ledger entry (and
 * `entry.result`) as a fresh object on each call, fired by unrelated background
 * queue activity; resetting on that reference would silently wipe the user's
 * in-progress deselections. Keying the reset on `(contentHash, parsedAt)` fires
 * only on a genuine new parse (a refinement landing) or a switch to a different
 * import. (`resultToken` is the entry's `parsedAt`; it also seeds the mapper's
 * clock so synthesized fallback dates match what Accept later commits.)
 */
export const useNotesImportSelection = (
  result: NotesImportResult,
  contentHash: string,
  resultToken: number
): {
  mapped: MappedNotesImport
  preview: NotesImportPreview
  selection: PreviewSelection
  toggleRow: (id: string) => void
  togglePublisher: () => void
  setGroup: (kind: PreviewKind, value: boolean) => void
  setRows: (ids: string[], value: boolean) => void
} => {
  const { mapped, preview, initialSelection } = useMemo(() => {
    const m = mapNotesImport(result, {
      contentHash,
      // Stable per-parse clock so synthesized fallback dates match what Accept
      // commits (the manager maps again from the same `parsedAt`).
      importedAt: new Date(resultToken),
    })
    const built = buildNotesImportPreview(m)
    return {
      mapped: m,
      preview: built.preview,
      initialSelection: built.selection,
    }
  }, [result, contentHash, resultToken])

  const [selection, setSelection] = useState<PreviewSelection>(initialSelection)

  // Reset the selection on a genuine new parse (parsedAt changed) OR a switch to
  // a different import (contentHash changed) — never on the reference churn of an
  // unrelated background hydrate(). Keying on parsedAt alone would miss a switch
  // between two imports that happened to parse in the same millisecond.
  const resetKey = `${contentHash}:${resultToken}`
  const resetKeyRef = useRef(resetKey)
  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey
      setSelection(initialSelection)
    }
  }, [resetKey, initialSelection])

  const toggleRow = useCallback((id: string) => {
    setSelection((s) => toggleRowSelection(s, id))
  }, [])

  const togglePublisher = useCallback(() => {
    setSelection((s) => togglePublisherSelection(s))
  }, [])

  const setRows = useCallback((rowIds: string[], value: boolean) => {
    setSelection((s) => setRowsSelection(s, rowIds, value))
  }, [])

  const setGroup = useCallback(
    (kind: PreviewKind, value: boolean) => {
      const rows =
        kind === 'contact'
          ? preview.contacts
          : kind === 'visit'
            ? preview.visits
            : preview.timeEntries
      setSelection((s) => setGroupSelection(s, rows, value))
    },
    [preview]
  )

  return {
    mapped,
    preview,
    selection,
    toggleRow,
    togglePublisher,
    setGroup,
    setRows,
  }
}
