/**
 * Where the web keeps note photos' bytes: the photo a note refers to by id. The
 * native app keeps them as `Documents/note-images/<id>.jpg` files, which a
 * browser doesn't have.
 *
 * This is the seam Cloud Sync's photo pass fills in (ADR 0040 §6,
 * docs/web-files.md): it holds the bytes for this page load only, so a photo
 * added on the web shows until the tab closes, and the photo pass needs to
 * persist them and `putWebPhoto` the ones it downloads. Same calls, other bytes
 * behind them.
 */

type Photo = { blob: Blob; savedAt: number; url?: string }
const photos = new Map<string, Photo>()

export function putWebPhoto(id: string, blob: Blob): void {
  const old = photos.get(id)
  if (old?.url) URL.revokeObjectURL(old.url)
  photos.set(id, { blob, savedAt: Date.now() })
}

export const hasWebPhoto = (id: string) => photos.has(id)

export const getWebPhotoBlob = (id: string) => photos.get(id)?.blob

/** An object URL that shows the photo; '' when this page has no such photo. */
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
