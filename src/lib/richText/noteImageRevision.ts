import { create } from 'zustand'
import { noteImagePath } from '@/lib/richText/noteImages'

const useNoteImageRevision = create<{ revision: number }>(() => ({
  revision: 0,
}))

export function noteImagesArrived() {
  useNoteImageRevision.setState(({ revision }) => ({ revision: revision + 1 }))
}

export function useNoteImageUri(id: string): string {
  const revision = useNoteImageRevision((state) => state.revision)
  const path = noteImagePath(id)
  return revision ? `${path}?r=${revision}` : path
}
