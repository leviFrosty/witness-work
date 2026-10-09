import { create } from 'zustand'
import { noteImagePath } from '@/lib/richText/noteImages'

/**
 * Bumped when photos arrive on this device (a sync download), so a photo that
 * showed "not on this device" tries its file again.
 */
const useNoteImageRevision = create<{ revision: number }>(() => ({
  revision: 0,
}))

export function noteImagesArrived() {
  useNoteImageRevision.setState(({ revision }) => ({ revision: revision + 1 }))
}

/** A photo's file URI, cache-busted once photos have arrived. */
export function useNoteImageUri(id: string): string {
  const revision = useNoteImageRevision((state) => state.revision)
  const path = noteImagePath(id)
  return revision ? `${path}?r=${revision}` : path
}
