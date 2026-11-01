import { analytics } from '@/lib/analytics'
import { useCallback, useRef, useState } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import { errorTracking } from '@/lib/errorTracking'
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
import { entryMinutes } from '@/lib/entryMinutes'

export type MytimeImportStatus =
  | 'idle'
  | 'parsing'
  | 'preview'
  | 'committing'
  | 'success'
  | 'error'

export type MytimeImportErrorKind = 'invalidFile' | 'unexpected'

export interface MytimeImportPreview {
  contacts: number
  visits: number
  timeEntries: number

  totalMinutes: number
  publisherRole?: Publisher
  tenureStartDate: Date | null
}

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
  totalMinutes: mapped.timeEntries.reduce((sum, e) => sum + entryMinutes(e), 0),
  publisherRole: mapped.publisher?.role,
  tenureStartDate: mapped.publisher?.tenureStartDate ?? null,
})

export const useMytimeImport = ({
  publisherMode,
}: {
  publisherMode: PublisherImportMode
}) => {
  const source = publisherMode === 'overwrite' ? 'onboarding' : 'settings'
  const [status, setStatus] = useState<MytimeImportStatus>('idle')
  const [preview, setPreview] = useState<MytimeImportPreview | null>(null)
  const [errorKind, setErrorKind] = useState<MytimeImportErrorKind | null>(null)
  const [selection, setSelection] =
    useState<MytimeImportSelection>(ALL_SELECTED)

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
    analytics.capture('import_started', { import_type: 'mytime', source })
    try {
      const { assets, canceled } = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: '*/*',
      })
      if (canceled || !assets?.length) {
        analytics.capture('import_cancelled', {
          import_type: 'mytime',
          source,
          stage: 'file_picker',
        })
        return
      }

      setStatus('parsing')
      const tables = await readMytimeDb(assets[0].uri)
      const mapped = mapMytimeData(tables, new Date())
      mappedRef.current = mapped
      setPreview(buildPreview(mapped))
      setSelection(ALL_SELECTED)
      setStatus('preview')
      analytics.capture('import_preview_ready', {
        import_type: 'mytime',
        source,
        contact_count: mapped.contacts.length,
        visit_count: mapped.visits.length,
        time_entry_count: mapped.timeEntries.length,
      })
    } catch (e) {
      analytics.capture('import_failed', {
        import_type: 'mytime',
        source,
        stage: 'parse',
        error_code:
          e instanceof MytimeImportError ? 'invalid_file' : 'unexpected',

        ...(e instanceof MytimeImportError && { file_kind: e.fileKind }),
      })
      mappedRef.current = null
      setPreview(null)
      if (e instanceof MytimeImportError) {
        setErrorKind('invalidFile')
      } else {
        logger.error('MyTime import: parse failed', e)
        errorTracking.captureException(e)
        setErrorKind('unexpected')
      }
      setStatus('error')
    }
  }, [source])

  const confirm = useCallback(() => {
    const mapped = mappedRef.current
    if (!mapped) return
    setStatus('committing')

    requestAnimationFrame(() => {
      try {
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
        analytics.capture('import_completed', {
          import_type: 'mytime',
          source,
          contacts_selected: selection.contacts,
          visits_selected: selection.visits,
          time_selected: selection.time,
          publisher_selected: selection.publisher,
        })
      } catch (e) {
        analytics.capture('import_failed', {
          import_type: 'mytime',
          source,
          stage: 'commit',
          error_code: 'unexpected',
        })
        logger.error('MyTime import: commit failed', e)
        errorTracking.captureException(e)
        setErrorKind('unexpected')
        setStatus('error')
      }
    })
  }, [publisherMode, selection, source])

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
