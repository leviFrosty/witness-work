import { useEffect, useRef, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import Haptics from '@/lib/haptics'
import { logger } from '@/lib/logger'
import useLibraryImagePicker from '@/hooks/useLibraryImagePicker'
import type {
  ScribePaperCapture,
  ScribePaperError,
  ScribePaperPage,
} from '@/features/scribe/types'
import {
  SCRIBE_PAPER_CONCURRENCY,
  SCRIBE_PAPER_MAX_PAGES,
} from '@/features/scribe/constants'
import { scribeClient } from '@/features/scribe/lib/defaultClient'
import { toScribeClientError } from '@/features/scribe/lib/errors'
import {
  deletePaperPages,
  firstUnreadPage,
  joinPaperPages,
  mapInOrder,
  preparePaperPage,
  retriesPaperPage,
} from '@/features/scribe/lib/paper'
import { noteScribeFailure } from '@/features/scribe/runtime/status'
import { noteUsage } from '@/features/scribe/stores/usage'
import { trackCaptureFinished } from '@/features/scribe/analytics'

/**
 * Failures that would fail every remaining page the same way, so the batch
 * stops instead of spending more requests.
 */
const BATCH_STOPPING: ReadonlySet<ScribePaperError> = new Set<ScribePaperError>(
  [
    'limit_reached',
    'page_limit',
    'rate_limited',
    'attestation_unavailable',
    'device_ineligible',
    'suspended',
    'update_required',
    'disabled',
    'unavailable',
    'network',
  ]
)

/**
 * Picked pages until each is read or the User skips the rest. `texts[i]` is
 * page i's text once read (null until then); the first `inserted` pages are in
 * the composer already.
 */
interface PaperBatch {
  pages: readonly ScribePaperPage[]
  texts: (string | null)[]
  inserted: number
}

async function pick(
  source: 'camera' | 'library',
  pickLibrary: (
    options: ImagePicker.ImagePickerOptions
  ) => Promise<ImagePicker.ImagePickerResult>
): Promise<ScribePaperPage[] | null> {
  if (source === 'camera') {
    let permission = await ImagePicker.getCameraPermissionsAsync()
    if (!permission.granted && permission.canAskAgain)
      permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) return null
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await pickLibrary({
          ...options,
          allowsMultipleSelection: true,
          selectionLimit: SCRIBE_PAPER_MAX_PAGES,
          orderedSelection: true,
        })
  if (result.canceled || !result.assets.length) return null
  return result.assets
    .slice(0, SCRIBE_PAPER_MAX_PAGES)
    .map(({ uri, width, height }) => ({ uri, width, height }))
}

/** Text for the composer, with the success haptic, or null when there's none. */
const landed = (text: string): string | null => {
  if (!text) return null
  void Haptics.success()
  return text
}

/**
 * Read paper pages (ADR 0025): page photos read into text by ww-api, metered, a
 * few at a time and kept in page order. A failure that would repeat on every
 * page (limits, the device, the connection) stops the batch and keeps what was
 * read. When pages are left unread for a reason that can pass (no connection, a
 * busy service), their copies stay until Try again reads them or the User skips
 * them, so nothing has to be picked again. The text goes to the composer for
 * the User to edit.
 */
export function useScribePaperCapture(): ScribePaperCapture {
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const [error, setError] = useState<ScribePaperError | null>(null)
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [unread, setUnread] = useState<ScribePaperCapture['unread']>(null)
  const running = useRef(false)
  const library = useLibraryImagePicker('scribe_paper')
  const controller = useRef<AbortController | null>(null)
  // The batch waiting on Try again or Skip.
  const kept = useRef<PaperBatch | null>(null)

  // Leaving the conversation stops a batch and drops kept pages.
  useEffect(
    () => () => {
      controller.current?.abort()
      if (kept.current) deletePaperPages(kept.current.pages)
      kept.current = null
    },
    []
  )

  /** The rest of what was read; deletes the copies. */
  const finish = (batch: PaperBatch): string => {
    if (kept.current === batch) kept.current = null
    const text = joinPaperPages(batch.texts.slice(batch.inserted))
    batch.inserted = batch.texts.length
    deletePaperPages(batch.pages)
    return text
  }

  /** Reads the batch's unread pages; the text that can go in now. */
  const read = async (batch: PaperBatch, retry: boolean): Promise<string> => {
    const indexes = batch.texts.flatMap((text, index) =>
      text == null ? [index] : []
    )
    const abort = new AbortController()
    controller.current = abort
    kept.current = null
    setProgress({ done: 0, total: indexes.length })
    // Written from the page tasks.
    const attempt = {
      stop: null as ScribePaperError | null,
      retryAt: null as number | null,
      /** The first single page's failure that a later attempt may get past. */
      passing: null as ScribePaperError | null,
      failed: 0,
    }
    try {
      await mapInOrder(
        indexes,
        SCRIBE_PAPER_CONCURRENCY,
        async (index) => {
          try {
            const image = await preparePaperPage(batch.pages[index])
            const result = await scribeClient().transcribe(
              { image, mimeType: 'image/jpeg' },
              abort.signal
            )
            noteUsage(result.usage)
            batch.texts[index] = result.text
            // Read: its copy goes now, even while other pages wait.
            deletePaperPages([batch.pages[index]])
          } catch (thrown) {
            const failure = toScribeClientError(thrown)
            noteUsage(failure.usage)
            const code: ScribePaperError =
              failure.serverCode === 'transcribe_limit'
                ? 'page_limit'
                : failure.code === 'cancelled'
                  ? 'unknown'
                  : failure.code
            if (!abort.signal.aborted && BATCH_STOPPING.has(code)) {
              if (
                !attempt.stop &&
                code === 'page_limit' &&
                failure.retryAfterMs
              )
                attempt.retryAt = Date.now() + failure.retryAfterMs
              attempt.stop ??= code
              noteScribeFailure(failure)
              abort.abort()
            } else if (!abort.signal.aborted) {
              logger.warn('[scribe] paper page failed', failure.code)
              if (retriesPaperPage(code)) attempt.passing ??= code
            }
            attempt.failed++
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

    const pages = indexes.length
    const attemptText = joinPaperPages(indexes.map((i) => batch.texts[i]))
    // The conversation closed mid-read: nothing goes in the composer.
    if (abort.signal.aborted && !attempt.stop) {
      deletePaperPages(batch.pages)
      trackCaptureFinished({
        input: 'paper',
        outcome: 'discarded',
        pages,
        retry,
      })
      return ''
    }

    const missing = batch.texts.filter((text) => text == null).length
    const cause = attempt.stop ?? attempt.passing
    if (missing && cause && retriesPaperPage(cause)) {
      // Text up to the first unread page goes in now; the pages after it wait,
      // so the composer keeps page order.
      const gap = firstUnreadPage(batch.texts, batch.inserted)
      const text = joinPaperPages(batch.texts.slice(batch.inserted, gap))
      batch.inserted = gap
      kept.current = batch
      setUnread({
        count: missing,
        total: batch.pages.length,
        reason: attempt.stop,
      })
      trackCaptureFinished({
        input: 'paper',
        outcome: attemptText ? 'done' : 'error',
        pages,
        errorCode: cause,
        retry,
        retryOffered: true,
      })
      return text
    }

    const text = finish(batch)
    const failedAll = !attemptText && attempt.failed > 0
    if (attempt.stop || failedAll) {
      setError(attempt.stop ?? 'unknown')
      setRetryAt(attempt.retryAt)
    }
    trackCaptureFinished({
      input: 'paper',
      outcome: attemptText
        ? 'done'
        : failedAll || attempt.stop
          ? 'error'
          : 'empty',
      pages,
      errorCode: attempt.stop,
      retry,
    })
    return text
  }

  const capture: ScribePaperCapture['capture'] = async (source, given) => {
    if (running.current) return null
    running.current = true
    setError(null)
    setRetryAt(null)
    try {
      const pages =
        source === 'pages'
          ? (given ?? []).slice(0, SCRIBE_PAPER_MAX_PAGES)
          : await pick(source, library.pick)
      if (!pages?.length) return null
      // New pages end a kept batch; what it read goes in first.
      const held = kept.current ? finish(kept.current) : ''
      setUnread(null)
      const text = await read(
        { pages, texts: pages.map(() => null), inserted: 0 },
        false
      )
      return landed(joinPaperPages([held, text]))
    } catch (thrown) {
      logger.warn('[scribe] paper capture failed', thrown)
      setError('unknown')
      trackCaptureFinished({
        input: 'paper',
        outcome: 'error',
        errorCode: 'unknown',
      })
      return null
    } finally {
      running.current = false
    }
  }

  const retry: ScribePaperCapture['retry'] = async () => {
    const batch = kept.current
    if (!batch || running.current) return null
    running.current = true
    setUnread(null)
    setError(null)
    setRetryAt(null)
    try {
      return landed(await read(batch, true))
    } finally {
      running.current = false
    }
  }

  const skip: ScribePaperCapture['skip'] = () => {
    const batch = kept.current
    if (!batch || running.current) return null
    setUnread(null)
    return landed(finish(batch))
  }

  return {
    available: true,
    picker: library.host,
    busy: progress !== null,
    progress,
    error,
    retryAt,
    unread,
    capture,
    retry,
    skip,
    clearError: () => {
      setError(null)
      setRetryAt(null)
    },
  }
}
