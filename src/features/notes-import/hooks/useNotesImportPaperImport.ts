import { useRef, useState } from 'react'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import i18n, { type TranslationKey } from '@/lib/locales'
import { logger } from '@/lib/logger'
import {
  NotesImportClientError,
  transcribeNotesPage,
  type NotesImportErrorCode,
} from '@/features/notes-import/lib/notesImportClient'
import { errorMessageKey } from '@/features/notes-import/lib/notesImportMessages'
import {
  PAPER_PAGE_CONCURRENCY,
  joinPaperPages,
  mapInOrder,
  preparePaperPage,
  stopsPaperBatch,
  type PaperPage,
} from '@/features/notes-import/lib/notesImportPaper'

export type PaperImportSource = 'onboarding' | 'composer'

type Outcome =
  | 'inserted'
  | 'partial'
  | 'empty'
  | 'cancelled'
  | 'failed'
  | 'limit_reached'

/**
 * Opens the photo library for up to `maxPages` page photos, in the order the
 * user taps them. Resolves null when cancelled. Exported for the onboarding
 * step, which picks before opening the composer.
 */
export async function pickPaperPages(
  maxPages: number
): Promise<PaperPage[] | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: maxPages,
    orderedSelection: true,
    quality: 1,
    exif: false,
  })
  if (result.canceled || !result.assets.length) return null
  return result.assets.slice(0, maxPages).map(({ uri, width, height }) => ({
    uri,
    width,
    height,
  }))
}

/**
 * Import from Paper (ADR 0025): reads page photos into text with ww-api's
 * vision model and hands the joined text to `onText` for the user to edit
 * before importing. Pages are read a few at a time and the text keeps their
 * order. A failure that would repeat on every page (allowance, device
 * verification, connection) stops the batch; whatever was read is kept.
 */
export function useNotesImportPaperImport({
  maxPages,
  onText,
  onLimitReached,
}: {
  /** Pages per batch from the server, or null when it can't read photos. */
  maxPages: number | null
  onText: (text: string) => void
  /** The free import allowance is used up; reading pages would be wasted. */
  onLimitReached: () => void
}) {
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const controller = useRef<AbortController | null>(null)

  const report = (
    source: PaperImportSource,
    outcome: Outcome,
    pageCount: number,
    extra: { failed_pages?: number; error_code?: NotesImportErrorCode } = {}
  ) =>
    analytics.capture('notes_import_capture_finished', {
      method: 'paper',
      paper_source: source,
      outcome,
      page_count: pageCount,
      ...extra,
    })

  const read = async (
    pages: readonly PaperPage[],
    source: PaperImportSource
  ) => {
    if (!pages.length || controller.current) return
    const abort = new AbortController()
    controller.current = abort
    setProgress({ done: 0, total: pages.length })
    // Written from the page tasks, so kept off TypeScript's narrowing.
    const batch = {
      stopCode: null as NotesImportErrorCode | null,
      failed: 0,
      truncated: false,
    }
    try {
      const texts = await mapInOrder(
        pages,
        PAPER_PAGE_CONCURRENCY,
        async (page) => {
          try {
            const image = await preparePaperPage(page)
            const result = await transcribeNotesPage({
              image,
              mimeType: 'image/jpeg',
              signal: abort.signal,
            })
            batch.truncated ||= result.truncated
            return result.text
          } catch (error) {
            const code =
              error instanceof NotesImportClientError ? error.code : 'unknown'
            if (abort.signal.aborted) {
              // A stopped batch aborts its other pages; keep the first cause.
              batch.stopCode ??= 'cancelled'
            } else if (stopsPaperBatch(code)) {
              batch.stopCode ??= code
              abort.abort()
            } else {
              logger.warn('Paper page failed', error)
            }
            batch.failed += 1
            return null
          } finally {
            setProgress((current) =>
              current ? { ...current, done: current.done + 1 } : current
            )
          }
        },
        () => abort.signal.aborted
      )
      const text = joinPaperPages(texts)
      const { stopCode, failed, truncated } = batch
      // Nothing to keep after a cancel; a stopped batch keeps what it read.
      if (stopCode === 'cancelled') {
        report(source, 'cancelled', pages.length)
        return
      }
      if (text) {
        void Haptics.success()
        onText(text)
      }
      if (stopCode === 'limit_reached') {
        report(source, 'limit_reached', pages.length)
        onLimitReached()
        return
      }
      if (stopCode) {
        report(source, text ? 'partial' : 'failed', pages.length, {
          failed_pages: failed,
          error_code: stopCode,
        })
        Alert.alert(
          i18n.t('notesImport_paperErrorTitle'),
          i18n.t(errorMessageKey(stopCode) as TranslationKey)
        )
        return
      }
      if (!text) {
        report(source, failed ? 'failed' : 'empty', pages.length, {
          failed_pages: failed,
        })
        Alert.alert(
          i18n.t(
            failed
              ? 'notesImport_paperErrorTitle'
              : 'notesImport_photoEmptyTitle'
          ),
          i18n.t(failed ? 'notesImport_error' : 'notesImport_photoEmptyBody')
        )
        return
      }
      report(source, failed ? 'partial' : 'inserted', pages.length, {
        failed_pages: failed,
      })
      if (failed || truncated) {
        Alert.alert(
          i18n.t('notesImport_paperPartialTitle'),
          failed
            ? i18n.t('notesImport_paperPartialBody', {
                count: failed,
                total: pages.length,
              })
            : i18n.t('notesImport_paperTruncatedBody')
        )
      }
    } finally {
      controller.current = null
      setProgress(null)
      // The picker's copies hold the user's private notes; don't keep them.
      for (const page of pages) {
        void FileSystem.deleteAsync(page.uri, { idempotent: true }).catch(
          () => {}
        )
      }
    }
  }

  const choose = async () => {
    if (!maxPages || controller.current) return
    const pages = await pickPaperPages(maxPages)
    if (!pages) {
      report('composer', 'cancelled', 0)
      return
    }
    await read(pages, 'composer')
  }

  return {
    supported: maxPages != null,
    reading: progress != null,
    progress,
    choose,
    read,
    cancel: () => controller.current?.abort(),
  }
}
