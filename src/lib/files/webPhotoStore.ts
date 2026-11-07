type Photo = { blob: Blob; savedAt: number; url?: string }
const photos = new Map<string, Photo>()

export function putWebPhoto(id: string, blob: Blob): void {
  const old = photos.get(id)
  if (old?.url) URL.revokeObjectURL(old.url)
  photos.set(id, { blob, savedAt: Date.now() })
}

export const hasWebPhoto = (id: string) => photos.has(id)

export const getWebPhotoBlob = (id: string) => photos.get(id)?.blob

export function getWebPhotoUrl(id: string): string {
  const photo = photos.get(id)
  if (!photo) return ''
  photo.url ??= URL.createObjectURL(photo.blob)
  return photo.url
}

export function deleteWebPhoto(id: string): void {
  const photo = photos.get(id)
  if (photo?.url) URL.revokeObjectURL(photo.url)
  photos.delete(id)
}

export const listWebPhotos = () =>
  [...photos].map(([id, { savedAt }]) => ({ id, modifiedAt: savedAt }))
