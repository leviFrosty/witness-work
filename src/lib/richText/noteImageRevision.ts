import { Platform } from 'react-native'
import { create } from 'zustand'
import { webPhotos } from '@/lib/files/webPhotoStore'
import { noteImagePath } from '@/lib/richText/noteImages'

const useNoteImageRevision = create<{ revision: number }>(() => ({
  revision: 0,
}))

export function noteImagesArrived() {
  useNoteImageRevision.setState(({ revision }) => ({ revision: revision + 1 }))
}

if (Platform.OS === 'web') webPhotos.onChange(noteImagesArrived)

const pathAt = (id: string, _revision: number) => noteImagePath(id)

const pendingAt = (id: string, _revision: number) =>
  Platform.OS === 'web' && webPhotos.pending(id)

export function useNoteImagePending(id: string): boolean {
  const revision = useNoteImageRevision((state) => state.revision)
  return pendingAt(id, revision)
}

export function useNoteImageUri(id: string): string {
  const revision = useNoteImageRevision((state) => state.revision)
  const path = pathAt(id, revision)

  if (!path || path.startsWith('blob:')) return path
  return revision ? `${path}?r=${revision}` : path
}
