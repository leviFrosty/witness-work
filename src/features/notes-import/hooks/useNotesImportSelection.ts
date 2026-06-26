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
 * `resultToken` (the entry's `parsedAt`) is the recompute/reset key — NOT the
 * `result` object reference. The manager's `hydrate()` rebuilds every ledger
 * entry (and `entry.result`) as a fresh object on each call, fired by unrelated
 * background queue activity; keying on the reference would silently wipe the
 * user's in-progress deselections. Keying on `parsedAt` resets the selection
 * only on a genuine new parse (a refinement landing).
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
      importedAt: new Date(),
    })
    const built = buildNotesImportPreview(m)
    return {
      mapped: m,
      preview: built.preview,
      initialSelection: built.selection,
    }
  }, [result, contentHash])

  const [selection, setSelection] = useState<PreviewSelection>(initialSelection)

  // Reset the selection ONLY on a genuine new parse (parsedAt changed) — never on
  // the reference churn of an unrelated background hydrate(). The memo above may
  // recompute a fresh (content-identical) preview on every hydrate, but the
  // user's in-progress deselections survive because the reset keys on the token.
  const tokenRef = useRef(resultToken)
  useEffect(() => {
    if (tokenRef.current !== resultToken) {
      tokenRef.current = resultToken
      setSelection(initialSelection)
    }
  }, [resultToken, initialSelection])

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
