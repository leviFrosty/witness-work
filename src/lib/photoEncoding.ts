import { usePreferences } from '@/stores/preferences'

export type PhotoEncoding = {
  maxSide: number | null
  quality: number
  optimized: boolean
}

const NOTE_PHOTO: PhotoEncoding = {
  maxSide: 2048,
  quality: 0.8,
  optimized: false,
}
const NOTE_PHOTO_OPTIMIZED: PhotoEncoding = {
  maxSide: 1280,
  quality: 0.6,
  optimized: true,
}
const AVATAR_PHOTO: PhotoEncoding = {
  maxSide: null,
  quality: 0.9,
  optimized: false,
}
const AVATAR_PHOTO_OPTIMIZED: PhotoEncoding = {
  maxSide: 768,
  quality: 0.7,
  optimized: true,
}

const optimizing = () => usePreferences.getState().optimizePhotoStorage

export const notePhotoEncoding = (): PhotoEncoding =>
  optimizing() ? NOTE_PHOTO_OPTIMIZED : NOTE_PHOTO

export const avatarPhotoEncoding = (): PhotoEncoding =>
  optimizing() ? AVATAR_PHOTO_OPTIMIZED : AVATAR_PHOTO

export function resizeToFit(
  size: { width: number; height: number },
  maxSide: number | null
): { width: number } | { height: number } | null {
  if (maxSide == null || Math.max(size.width, size.height) <= maxSide)
    return null
  return size.width >= size.height ? { width: maxSide } : { height: maxSide }
}
