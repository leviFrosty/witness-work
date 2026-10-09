import { useEffect } from 'react'
import { addForegroundListener } from '@/lib/appLifecycle'
import { logger } from '@/lib/logger'
import { deleteNoteImages, listNoteImageFiles } from '@/lib/richText/noteImages'
import { referencedNoteImageIds } from '@/stores/noteImages'

/**
 * A photo file no note refers to is kept this long first. A photo added in the
 * editor isn't in any record until its form is saved, and a delete may be
 * undone.
 */
export const NOTE_IMAGE_GRACE_MS = 24 * 60 * 60_000
const SWEEP_INTERVAL_MS = 6 * 60 * 60_000

/** Deletes local note photos no note refers to, past the grace period. */
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
  // Re-read: a pull or an edit may have referred to one while files were
  // listed.
  const stillReferenced = referencedNoteImageIds()
  const deletable = orphans.filter((id) => !stillReferenced.has(id))
  await deleteNoteImages(deletable)
  return deletable.length
}

/** Sweeps unused note photos after launch and when the app comes back. */
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
