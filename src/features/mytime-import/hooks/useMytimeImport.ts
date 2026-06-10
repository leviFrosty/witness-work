import { useCallback, useRef, useState } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import * as Sentry from '@sentry/react-native'
import { logger } from '@/lib/logger'
import {
  readMytimeDb,
  MytimeImportError,
} from '@/features/mytime-import/lib/readMytimeDb'
import {
  mapMytimeData,
  type MappedImport,
} from '@/features/mytime-import/lib/mapMytimeData'
import {
  writeMappedDataToStores,
  type PublisherImportMode,
} from '@/features/mytime-import/lib/importMytime'
import type { Publisher } from '@/types/publisher'

/**
 * Where the import flow is: `idle` → `parsing` (reading + mapping the picked
 * file) → `preview` (counts shown, awaiting confirm) → `committing` →
 * `success`, with `error` reachable from a failed parse or commit.
 */
export type MytimeImportStatus =
  | 'idle'
  | 'parsing'
  | 'preview'
  | 'committing'
  | 'success'
  | 'error'

/**
 * `invalidFile` is an expected user mistake (wrong file) shown as a friendly
 * message and never reported; `unexpected` is a real defect, surfaced as a
 * generic error and sent to Sentry.
 */
export type MytimeImportErrorKind = 'invalidFile' | 'unexpected'

/** Summary derived from the mapped backup, shown before the user commits. */
export interface MytimeImportPreview {
  contacts: number
  visits: number
  timeEntries: number
  /** Net minutes across every imported entry (residual adjustments included). */
  totalMinutes: number
  publisherRole?: Publisher
  tenureStartDate: Date | null
}

/**
 * Which pieces of the backup the user has opted to import. Every piece starts
 * checked; the preview surfaces a checkbox per piece that has data. `contacts`
 * also governs custom fields, and `time` also governs imported categories (each
 * rides along with the records that reference it).
 */
export interface MytimeImportSelection {
  contacts: boolean
  visits: boolean
  time: boolean
  publisher: boolean
}

export type MytimeImportSelectionKey = keyof MytimeImportSelection

const ALL_SELECTED: MytimeImportSelection = {
  contacts: true,
  visits: true,
  time: true,
  publisher: true,
}

const buildPreview = (mapped: MappedImport): MytimeImportPreview => ({
  contacts: mapped.contacts.length,
  visits: mapped.visits.length,
  timeEntries: mapped.timeEntries.length,
  totalMinutes: mapped.timeEntries.reduce(
    (sum, e) => sum + e.hours * 60 + e.minutes,
    0
  ),
  publisherRole: mapped.publisher?.role,
  tenureStartDate: mapped.publisher?.tenureStartDate ?? null,
})

/**
 * Drives the shared MyTime-import flow for both surfaces. The expensive work
 * (read + map) runs at parse time so the preview reflects exactly what will be
 * written; the mapped result is held until the user confirms, then persisted
 * with the surface's `publisherMode` (`'overwrite'` for onboarding,
 * `'fillIfUnset'` for Settings).
 */
export const useMytimeImport = ({
  publisherMode,
}: {
  publisherMode: PublisherImportMode
}) => {
  const [status, setStatus] = useState<MytimeImportStatus>('idle')
  const [preview, setPreview] = useState<MytimeImportPreview | null>(null)
  const [errorKind, setErrorKind] = useState<MytimeImportErrorKind | null>(null)
  const [selection, setSelection] =
    useState<MytimeImportSelection>(ALL_SELECTED)
  // The mapped backup awaiting confirmation. A ref (not state) because nothing
  // renders it directly — only `confirm` reads it — and it must not trigger a
  // re-render when set.
  const mappedRef = useRef<MappedImport | null>(null)

  const reset = useCallback(() => {
    mappedRef.current = null
    setPreview(null)
    setErrorKind(null)
    setSelection(ALL_SELECTED)
    setStatus('idle')
  }, [])

  const toggleSelection = useCallback((key: MytimeImportSelectionKey) => {
    setSelection((s) => ({ ...s, [key]: !s[key] }))
  }, [])

  const pickAndParse = useCallback(async () => {
    setErrorKind(null)
    try {
      // `.mytimedb` has no registered MIME type, so accept anything and let the
      // reader's validation probe reject non-MyTime files.
      const { assets, canceled } = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: '*/*',
      })
      if (canceled || !assets?.length) return

      setStatus('parsing')
      const tables = await readMytimeDb(assets[0].uri)
      const mapped = mapMytimeData(tables, new Date())
      mappedRef.current = mapped
      setPreview(buildPreview(mapped))
      setSelection(ALL_SELECTED)
      setStatus('preview')
    } catch (e) {
      mappedRef.current = null
      setPreview(null)
      if (e instanceof MytimeImportError) {
        setErrorKind('invalidFile')
      } else {
        logger.error('MyTime import: parse failed', e)
        Sentry.captureException(e)
        setErrorKind('unexpected')
      }
      setStatus('error')
    }
  }, [])

  const confirm = useCallback(() => {
    const mapped = mappedRef.current
    if (!mapped) return
    setStatus('committing')
    // Defer the synchronous store writes one frame so the spinner paints before
    // the setState cascade blocks the JS thread (mirrors iCloudRestore).
    requestAnimationFrame(() => {
      try {
        // Honor the user's checkboxes by zeroing out deselected pieces; the
        // writer already no-ops on empty arrays / a null publisher. Custom
        // fields ride with contacts and categories ride with time, since
        // they're only referenced by those records.
        const selected: MappedImport = {
          contacts: selection.contacts ? mapped.contacts : [],
          customFieldDefs: selection.contacts ? mapped.customFieldDefs : [],
          visits: selection.visits ? mapped.visits : [],
          timeEntries: selection.time ? mapped.timeEntries : [],
          categories: selection.time ? mapped.categories : [],
          publisher: selection.publisher ? mapped.publisher : null,
        }
        writeMappedDataToStores(selected, { publisherMode })
        mappedRef.current = null
        setStatus('success')
      } catch (e) {
        logger.error('MyTime import: commit failed', e)
        Sentry.captureException(e)
        setErrorKind('unexpected')
        setStatus('error')
      }
    })
  }, [publisherMode, selection])

  // Disable the commit when nothing with data is still checked — importing
  // would be a no-op.
  const canConfirm =
    !!preview &&
    ((preview.contacts > 0 && selection.contacts) ||
      (preview.visits > 0 && selection.visits) ||
      (preview.timeEntries > 0 && selection.time) ||
      (!!preview.publisherRole && selection.publisher))

  return {
    status,
    preview,
    errorKind,
    selection,
    toggleSelection,
    canConfirm,
    pickAndParse,
    confirm,
    reset,
  }
}
