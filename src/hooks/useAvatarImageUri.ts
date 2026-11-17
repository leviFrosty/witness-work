import { useSyncExternalStore } from 'react'
import { webPhotoPathId, webPhotos } from '@/lib/files/webPhotoStore'

const unchanging = () => () => {}

export const webAvatarPhotoId = (value: string): string | undefined =>
  webPhotoPathId(value.split('?')[0])

export function useAvatarImageUri(value: string): string {
  const id = webAvatarPhotoId(value)
  const snapshot = () => (id === undefined ? value : webPhotos.url(id))
  return useSyncExternalStore(
    id === undefined ? unchanging : webPhotos.onChange,
    snapshot,
    snapshot
  )
}
