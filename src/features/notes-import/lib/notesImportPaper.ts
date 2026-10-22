import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import type { NotesImportErrorCode } from '@/features/notes-import/lib/notesImportClient'

/**
 * Import from Paper (ADR 0025): page photos are resized and re-encoded on the
 * device, read into text by ww-api one page at a time, and the text lands in
 * the composer draft for review before the normal import runs.
 */

/** A picked page photo. Width and height come from the picker. */
export interface PaperPage {
  uri: string
  width: number
  height: number
}

/**
 * Long edge of the uploaded page: enough for small handwriting, and a JPEG well
 * under ww-api's per-page byte limit.
 */
export const PAPER_PAGE_MAX_EDGE = 2000

/** Pages read at once; the rest wait their turn. */
export const PAPER_PAGE_CONCURRENCY = 3

/**
 * Re-encodes a page as a JPEG no larger than {@link PAPER_PAGE_MAX_EDGE}.
 * Re-encoding also drops EXIF, so a photo's location never leaves the device.
 */
export async function preparePaperPage(page: PaperPage): Promise<string> {
  const longEdge = Math.max(page.width, page.height)
  const result = await ImageManipulator.manipulateAsync(
    page.uri,
    longEdge > PAPER_PAGE_MAX_EDGE
      ? [
          {
            resize:
              page.width >= page.height
                ? { width: PAPER_PAGE_MAX_EDGE }
                : { height: PAPER_PAGE_MAX_EDGE },
          },
        ]
      : [],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  )
  void FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {})
  if (!result.base64) throw new Error('Page could not be encoded')
  return result.base64
}

/** Joins page texts in page order, a blank line between pages. */
export const joinPaperPages = (
  texts: readonly (string | null | undefined)[]
): string =>
  texts
    .map((text) => text?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')

/**
 * Failures that would fail every remaining page the same way, so the batch
 * stops instead of spending more requests.
 */
const BATCH_STOPPING_CODES = new Set<NotesImportErrorCode>([
  'limit_reached',
  'transcribe_limit',
  'attestation_failed',
  'attestation_unavailable',
  'device_ineligible',
  'suspended',
  'upgrade_required',
  'unavailable',
  'network',
  'cancelled',
])

export const stopsPaperBatch = (code: NotesImportErrorCode): boolean =>
  BATCH_STOPPING_CODES.has(code)

/**
 * Failures a later attempt can get past (a lost connection, a busy or briefly
 * unavailable service), so the unread pages are kept for Try Again.
 */
const RETRYABLE_CODES = new Set<NotesImportErrorCode>([
  'network',
  'unavailable',
  'attestation_unavailable',
  'active_cap',
  'model_error',
  'unknown',
])

export const retriesPaperPage = (code: NotesImportErrorCode): boolean =>
  RETRYABLE_CODES.has(code)

/**
 * The first page at or after `from` that hasn't been read (`null`), or
 * `texts.length` when all of them have. Text up to there can go into the draft
 * now and keep page order; text after it waits for the pages before it.
 */
export const firstUnreadPage = (
  texts: readonly (string | null)[],
  from: number
): number => {
  let index = from
  while (index < texts.length && texts[index] != null) index += 1
  return index
}

/**
 * Deletes the picker's copies of the pages. They hold the user's private notes,
 * so they go once the pages are read or skipped; the launch cleanup of
 * `ImagePicker/` catches any an app kill left behind.
 */
export const deletePaperPages = (pages: readonly PaperPage[]) => {
  for (const page of pages) {
    void FileSystem.deleteAsync(page.uri, { idempotent: true }).catch(() => {})
  }
}

/**
 * Runs `task` over `items` with at most `limit` in flight, keeping results in
 * input order. Stops starting new items once `shouldStop` returns true.
 */
export async function mapInOrder<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
  shouldStop: () => boolean
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length && !shouldStop()) {
      const index = next++
      results[index] = await task(items[index], index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  )
  return results
}
