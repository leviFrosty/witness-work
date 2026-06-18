import { useCallback, useMemo, useRef, useState } from 'react'
import * as Sentry from '@sentry/react-native'
import { logger } from '@/lib/logger'
import {
  writeMappedDataToStores,
  undoImport,
  type ImportCommitResult,
  type PublisherImportMode,
} from '@/lib/import/writeMappedData'
import {
  requestNotesImport,
  NotesImportClientError,
  type NotesImportErrorCode,
  type NotesImportCredits,
} from '@/features/notes-import/lib/notesImportClient'
import { buildNotesImportContext } from '@/features/notes-import/lib/buildNotesImportContext'
import {
  mapNotesImport,
  type MappedNotesImport,
} from '@/features/notes-import/lib/mapNotesImport'
import {
  buildNotesImportPreview,
  selectMappedImport,
  type NotesImportPreview,
  type PreviewKind,
  type PreviewSelection,
} from '@/features/notes-import/lib/buildNotesImportPreview'
import {
  putParsedResult,
  markAccepted,
  clearAccepted,
} from '@/features/notes-import/lib/notesImportLedger'
import type { NotesImportResult } from '@/features/notes-import/lib/notesImportTypes'

/**
 * Flow: `idle` → `submitting` (network + model) → `preview` (toggle records,
 * optionally `refine`) → `committing` → `success` (with `undo`). `error` is
 * reachable from a failed submit; `errorCode` lets the UI branch (e.g. show the
 * paywall on `limit_reached`).
 */
export type NotesImportStatus =
  | 'idle'
  | 'submitting'
  | 'preview'
  | 'committing'
  | 'success'
  | 'error'

export const useNotesImport = ({
  publisherMode,
}: {
  publisherMode: PublisherImportMode
}) => {
  const [status, setStatus] = useState<NotesImportStatus>('idle')
  const [preview, setPreview] = useState<NotesImportPreview | null>(null)
  const [selection, setSelection] = useState<PreviewSelection>({
    ids: new Set(),
    publisher: false,
  })
  const [credits, setCredits] = useState<NotesImportCredits | null>(null)
  const [errorCode, setErrorCode] = useState<NotesImportErrorCode | null>(null)
  const [refining, setRefining] = useState(false)

  // Non-rendering state held across the flow.
  const notesTextRef = useRef('')
  const resultRef = useRef<NotesImportResult | null>(null)
  const mappedRef = useRef<MappedNotesImport | null>(null)
  const contentHashRef = useRef('')
  const commitRef = useRef<ImportCommitResult | null>(null)

  const reset = useCallback(() => {
    notesTextRef.current = ''
    resultRef.current = null
    mappedRef.current = null
    contentHashRef.current = ''
    commitRef.current = null
    setPreview(null)
    setSelection({ ids: new Set(), publisher: false })
    setCredits(null)
    setErrorCode(null)
    setRefining(false)
    setStatus('idle')
  }, [])

  const applyResult = useCallback(
    (result: NotesImportResult, contentHash: string) => {
      resultRef.current = result
      contentHashRef.current = contentHash
      putParsedResult(contentHash, result, Date.now())
      const mapped = mapNotesImport(result, {
        contentHash,
        importedAt: new Date(),
      })
      mappedRef.current = mapped
      const built = buildNotesImportPreview(mapped)
      setPreview(built.preview)
      setSelection(built.selection)
    },
    []
  )

  const submit = useCallback(
    async (notesText: string) => {
      const text = notesText.trim()
      if (!text) return
      notesTextRef.current = text
      setErrorCode(null)
      setStatus('submitting')
      try {
        const context = buildNotesImportContext()
        const res = await requestNotesImport({ notesText: text, context })
        setCredits(res.credits)
        applyResult(res.result, res.contentHash)
        setStatus('preview')
      } catch (e) {
        const code = e instanceof NotesImportClientError ? e.code : 'unknown'
        if (code === 'unknown' || code === 'model_error') {
          logger.error('Notes import: submit failed', e)
          Sentry.captureException(e)
        }
        setErrorCode(code)
        setStatus('error')
      }
    },
    [applyResult]
  )

  /** Stateless follow-up correction — free, re-parses the SAME source text. */
  const refine = useCallback(
    async (instruction: string) => {
      const trimmed = instruction.trim()
      const previous = resultRef.current
      if (!trimmed || !previous || refining) return
      setRefining(true)
      setErrorCode(null)
      try {
        const context = buildNotesImportContext()
        const res = await requestNotesImport({
          notesText: notesTextRef.current,
          context,
          refinement: {
            previousResultJSON: JSON.stringify(previous),
            instruction: trimmed,
          },
        })
        setCredits(res.credits)
        applyResult(res.result, res.contentHash)
      } catch (e) {
        const code = e instanceof NotesImportClientError ? e.code : 'unknown'
        if (code === 'unknown' || code === 'model_error') {
          Sentry.captureException(e)
        }
        setErrorCode(code)
      } finally {
        setRefining(false)
      }
    },
    [applyResult, refining]
  )

  const toggleRow = useCallback((id: string) => {
    setSelection((s) => {
      const ids = new Set(s.ids)
      if (ids.has(id)) ids.delete(id)
      else ids.add(id)
      return { ...s, ids }
    })
  }, [])

  const togglePublisher = useCallback(() => {
    setSelection((s) => ({ ...s, publisher: !s.publisher }))
  }, [])

  /** Select/deselect every row in a group at once. */
  const setGroup = useCallback(
    (kind: PreviewKind, value: boolean) => {
      const rows =
        kind === 'contact'
          ? preview?.contacts
          : kind === 'visit'
            ? preview?.visits
            : preview?.timeEntries
      if (!rows) return
      setSelection((s) => {
        const ids = new Set(s.ids)
        for (const r of rows) {
          if (value) ids.add(r.id)
          else ids.delete(r.id)
        }
        return { ...s, ids }
      })
    },
    [preview]
  )

  const canConfirm = useMemo(
    () =>
      status === 'preview' && (selection.ids.size > 0 || selection.publisher),
    [status, selection]
  )

  const confirm = useCallback(() => {
    const mapped = mappedRef.current
    if (!mapped) return
    setStatus('committing')
    // Defer the synchronous store writes a frame so the spinner paints first
    // (mirrors the MyTime + iCloud commit paths).
    requestAnimationFrame(() => {
      try {
        const selected = selectMappedImport(mapped, selection)
        const commit = writeMappedDataToStores(selected, { publisherMode })
        commitRef.current = commit
        markAccepted(contentHashRef.current, commit, Date.now())
        setStatus('success')
      } catch (e) {
        logger.error('Notes import: commit failed', e)
        Sentry.captureException(e)
        setErrorCode('unknown')
        setStatus('error')
      }
    })
  }, [publisherMode, selection])

  const undo = useCallback(() => {
    const commit = commitRef.current
    if (!commit) return
    try {
      undoImport(commit)
      clearAccepted(contentHashRef.current)
    } catch (e) {
      logger.error('Notes import: undo failed', e)
      Sentry.captureException(e)
    }
    reset()
  }, [reset])

  return {
    status,
    preview,
    selection,
    credits,
    errorCode,
    refining,
    canConfirm,
    submit,
    refine,
    toggleRow,
    togglePublisher,
    setGroup,
    confirm,
    undo,
    reset,
  }
}
