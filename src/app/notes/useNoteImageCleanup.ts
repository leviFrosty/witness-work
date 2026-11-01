import { useEffect } from 'react'
import { addForegroundListener } from '@/lib/appLifecycle'
import { logger } from '@/lib/logger'
import { deleteNoteImages, listNoteImageFiles } from '@/lib/richText/noteImages'
import { referencedNoteImageIds } from '@/stores/noteImages'

export const NOTE_IMAGE_GRACE_MS = 24 * 60 * 60_000
const SWEEP_INTERVAL_MS = 6 * 60 * 60_000

export async function sweepNoteImages(now = Date.now()): Promise<number> {
  const files = await listNoteImageFiles()
  if (!files.length) return 0
  const referenced = referencedNoteImageIds()
  const orphans = files
    .filter(
      (file) =>
        !referenced.has(file.id) && now - file.modifiedAt > NOTE_IMAGE_GRACE_MS
    )
    .map((file) => file.id)

  const stillReferenced = referencedNoteImageIds()
  const deletable = orphans.filter((id) => !stillReferenced.has(id))
  await deleteNoteImages(deletable)
  return deletable.length
}

export function useNoteImageCleanup(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready) return
    const sweep = () => {
      void sweepNoteImages()
        .then((deleted) => {
          if (deleted) logger.log('[notes] removed unused photos', { deleted })
        })
        .catch((error: unknown) =>
          logger.warn('[notes] photo cleanup failed', error)
        )
    }
    sweep()
    const listener = addForegroundListener(sweep, {
      minIntervalMs: SWEEP_INTERVAL_MS,
    })
    return () => listener.remove()
  }, [ready])
}
