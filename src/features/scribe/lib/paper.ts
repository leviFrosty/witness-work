import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import type { ScribePaperError, ScribePaperPage } from '@/features/scribe/types'

export const PAPER_PAGE_MAX_EDGE = 2000

export async function preparePaperPage(page: ScribePaperPage): Promise<string> {
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

const RETRYABLE: ReadonlySet<ScribePaperError> = new Set<ScribePaperError>([
  'network',
  'timeout',
  'rate_limited',
  'unavailable',
  'attestation_unavailable',
  'model_error',
  'unknown',
])

export const retriesPaperPage = (code: ScribePaperError): boolean =>
  RETRYABLE.has(code)

export const firstUnreadPage = (
  texts: readonly (string | null)[],
  from: number
): number => {
  let index = from
  while (index < texts.length && texts[index] != null) index += 1
  return index
}

export const deletePaperPages = (pages: readonly ScribePaperPage[]): void => {
  for (const page of pages)
    void FileSystem.deleteAsync(page.uri, { idempotent: true }).catch(() => {})
}

export const joinPaperPages = (
  texts: readonly (string | null | undefined)[]
): string =>
  texts
    .map((text) => text?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')

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
