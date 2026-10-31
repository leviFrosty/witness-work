import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { randomUUID } from 'expo-crypto'
import {
  ensureNoteImageDirectory,
  markNoteImagesLocal,
  noteImagePath,
} from '@/lib/richText/noteImages'
import { putWebPhoto } from '@/lib/files/webPhotoStore'
import type { RichTextImageAttrs } from '@/types/richText'

/** Long edge, in pixels. Keeps sync transfers inside iCloud's read deadline. */
export const NOTE_IMAGE_MAX_SIDE = 2048
const JPEG_QUALITY = 0.8

/**
 * Copies a picked photo into the note images folder, downscaled and re-encoded
 * as JPEG (which also drops its location metadata).
 */
export async function saveNoteImage(
  sourceUri: string,
  size?: { width: number; height: number }
): Promise<RichTextImageAttrs> {
  if (Platform.OS === 'web') return saveWebNoteImage(sourceUri)
  await ensureNoteImageDirectory()
  const resize =
    size && Math.max(size.width, size.height) > NOTE_IMAGE_MAX_SIDE
      ? size.width >= size.height
        ? { width: NOTE_IMAGE_MAX_SIDE }
        : { height: NOTE_IMAGE_MAX_SIDE }
      : null
  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    resize ? [{ resize }] : [],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  )
  const id = randomUUID()
  await FileSystem.moveAsync({ from: result.uri, to: noteImagePath(id) })
  markNoteImagesLocal([id])
  return { id, width: result.width, height: result.height }
}

/** The web keeps the downscaled JPEG in memory (`webPhotoStore`), not a file. */
async function saveWebNoteImage(
  sourceUri: string
): Promise<RichTextImageAttrs> {
  const { renderJpeg } = await import('@/lib/files/webImages')
  const { blob, width, height } = await renderJpeg(sourceUri, {
    maxSide: NOTE_IMAGE_MAX_SIDE,
    quality: JPEG_QUALITY,
  })
  const id = randomUUID()
  putWebPhoto(id, blob)
  markNoteImagesLocal([id])
  return { id, width, height }
}
