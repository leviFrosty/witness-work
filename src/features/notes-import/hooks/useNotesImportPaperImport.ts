import { useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
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
  deletePaperPages,
  firstUnreadPage,
  joinPaperPages,
  mapInOrder,
  preparePaperPage,
  retriesPaperPage,
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
 * Picked pages until every one is read or the user skips the rest. `texts[i]`
 * is page i's text once read (null until then); the first `inserted` pages are
 * in the draft already.
 */
type PaperBatch = {
  pages: readonly PaperPage[]
  texts: (string | null)[]
  inserted: number
  truncated: boolean
  source: PaperImportSource
}

/**
 * Import from Paper (ADR 0025): reads page photos into text with ww-api's
 * vision model and hands the joined text to `onText` for the user to edit
 * before importing. Pages are read a few at a time and the text keeps their
 * order. A failure that would repeat on every page (allowance, device
 * verification, connection) stops the batch; whatever was read is kept. When
 * pages are left unread for a reason that can pass (no connection, a busy
 * service), the picked copies stay until Try Again reads them or the user skips
 * them, so nothing has to be picked again.
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
  // The batch waiting on Try Again or Skip.
  const kept = useRef<PaperBatch | null>(null)

  // Leaving the composer stops a batch and drops kept pages.
  useEffect(
    () => () => {
      controller.current?.abort()
      if (kept.current) deletePaperPages(kept.current.pages)
      kept.current = null
    },
    []
  )

  const report = (
    source: PaperImportSource,
    outcome: Outcome,
    pageCount: number,
    extra: {
      failed_pages?: number
      error_code?: NotesImportErrorCode
      retry?: boolean
      retry_offered?: boolean
    } = {}
  ) =>
    analytics.capture('notes_import_capture_finished', {
      method: 'paper',
      paper_source: source,
      outcome,
      page_count: pageCount,
      ...extra,
    })

  /** Puts the rest of what was read in the draft and deletes the copies. */
  const finish = (batch: PaperBatch) => {
    if (kept.current === batch) kept.current = null
    const text = joinPaperPages(batch.texts.slice(batch.inserted))
    batch.inserted = batch.texts.length
    deletePaperPages(batch.pages)
    if (text) {
      void Haptics.success()
      onText(text)
    }
  }

  const run = async (batch: PaperBatch, retry: boolean) => {
    const unread = batch.texts.flatMap((text, index) =>
      text == null ? [index] : []
    )
    if (!unread.length || controller.current) return
    kept.current = null
    const abort = new AbortController()
    controller.current = abort
    setProgress({ done: 0, total: unread.length })
    // Written from the page tasks, so kept off TypeScript's narrowing.
    const attempt = {
      stopCode: null as NotesImportErrorCode | null,
      failed: 0,
      retryable: false,
    }
    try {
      await mapInOrder(
        unread,
        PAPER_PAGE_CONCURRENCY,
        async (index) => {
          try {
            const image = await preparePaperPage(batch.pages[index])
            const result = await transcribeNotesPage({
              image,
              mimeType: 'image/jpeg',
              signal: abort.signal,
            })
            batch.truncated ||= result.truncated
            batch.texts[index] = result.text
          } catch (error) {
            const code =
              error instanceof NotesImportClientError ? error.code : 'unknown'
            if (abort.signal.aborted) {
              // A stopped batch aborts its other pages; keep the first cause.
              attempt.stopCode ??= 'cancelled'
            } else if (stopsPaperBatch(code)) {
              attempt.stopCode ??= code
              abort.abort()
            } else {
              logger.warn('Paper page failed', error)
            }
            attempt.retryable ||= retriesPaperPage(code)
            attempt.failed += 1
          } finally {
            setProgress((current) =>
              current ? { ...current, done: current.done + 1 } : current
            )
          }
        },
        () => abort.signal.aborted
      )
    } finally {
      controller.current = null
      setProgress(null)
    }

    const { stopCode, failed } = attempt
    const pageCount = unread.length
    // Nothing more goes in the draft after a cancel.
    if (stopCode === 'cancelled') {
      report(batch.source, 'cancelled', pageCount, { retry })
      deletePaperPages(batch.pages)
      return
    }
    const attemptText = joinPaperPages(unread.map((i) => batch.texts[i]))
    const missing = batch.texts.filter((text) => text == null).length

    if (
      missing &&
      (stopCode ? retriesPaperPage(stopCode) : attempt.retryable)
    ) {
      // Text up to the first unread page goes in now; the pages after it wait
      // so the draft keeps page order.
      const gap = firstUnreadPage(batch.texts, batch.inserted)
      const text = joinPaperPages(batch.texts.slice(batch.inserted, gap))
      batch.inserted = gap
      if (text) {
        void Haptics.success()
        onText(text)
      }
      kept.current = batch
      report(batch.source, attemptText ? 'partial' : 'failed', pageCount, {
        failed_pages: failed,
        error_code: stopCode ?? undefined,
        retry,
        retry_offered: true,
      })
      Alert.alert(
        i18n.t('notesImport_paperErrorTitle'),
        stopCode
          ? i18n.t(errorMessageKey(stopCode) as TranslationKey)
          : // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
            i18n.t('notesImport_paperUnreadBody', {
              count: missing,
              total: batch.pages.length,
            }),
        [
          {
            text: i18n.t('notesImport_paperSkipUnread'),
            style: 'cancel',
            onPress: () => finish(batch),
          },
          {
            text: i18n.t('common_tryAgain'),
            onPress: () => void run(batch, true),
          },
        ],
        { cancelable: false }
      )
      return
    }

    const anyText = !!joinPaperPages(batch.texts)
    finish(batch)
    if (stopCode === 'limit_reached') {
      report(batch.source, 'limit_reached', pageCount, { retry })
      onLimitReached()
      return
    }
    if (stopCode) {
      report(batch.source, attemptText ? 'partial' : 'failed', pageCount, {
        failed_pages: failed,
        error_code: stopCode,
        retry,
      })
      Alert.alert(
        i18n.t('notesImport_paperErrorTitle'),
        i18n.t(errorMessageKey(stopCode) as TranslationKey)
      )
      return
    }
    if (!anyText) {
      report(batch.source, failed ? 'failed' : 'empty', pageCount, {
        failed_pages: failed,
        retry,
      })
      Alert.alert(
        i18n.t(
          failed ? 'notesImport_paperErrorTitle' : 'notesImport_photoEmptyTitle'
        ),
        i18n.t(failed ? 'notesImport_error' : 'notesImport_photoEmptyBody')
      )
      return
    }
    report(
      batch.source,
      failed ? (attemptText ? 'partial' : 'failed') : 'inserted',
      pageCount,
      { failed_pages: failed, retry }
    )
    if (missing || batch.truncated) {
      Alert.alert(
        i18n.t('notesImport_paperPartialTitle'),
        missing
          ? // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
            i18n.t('notesImport_paperPartialBody', {
              count: missing,
              total: batch.pages.length,
            })
          : i18n.t('notesImport_paperTruncatedBody')
      )
    }
  }

  const read = async (
    pages: readonly PaperPage[],
    source: PaperImportSource
  ) => {
    if (!pages.length || controller.current) return
    if (kept.current) finish(kept.current)
    await run(
      {
        pages,
        texts: pages.map(() => null),
        inserted: 0,
        truncated: false,
        source,
      },
      false
    )
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
