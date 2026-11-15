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
import { notePhotoEncoding, resizeToFit } from '@/lib/photoEncoding'
import type { RichTextImageAttrs } from '@/types/richText'

export async function saveNoteImage(
  sourceUri: string,
  size?: { width: number; height: number }
): Promise<RichTextImageAttrs> {
  if (Platform.OS === 'web') return saveWebNoteImage(sourceUri)
  await ensureNoteImageDirectory()
  const { maxSide, quality, optimized } = notePhotoEncoding()
  const measured = size ?? (optimized ? await measureImage(sourceUri) : null)
  const resize = measured ? resizeToFit(measured, maxSide) : null
  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    resize ? [{ resize }] : [],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
  )
  const id = randomUUID()
  await FileSystem.moveAsync({ from: result.uri, to: noteImagePath(id) })
  markNoteImagesLocal([id])
  return { id, width: result.width, height: result.height }
}

async function saveWebNoteImage(
  sourceUri: string
): Promise<RichTextImageAttrs> {
  const { renderJpeg } = await import('@/lib/files/webImages')
  const { maxSide, quality } = notePhotoEncoding()
  const { blob, width, height } = await renderJpeg(sourceUri, {
    maxSide: maxSide ?? Number.MAX_SAFE_INTEGER,
    quality,
  })
  const id = randomUUID()
  putWebPhoto(id, blob)
  markNoteImagesLocal([id])
  return { id, width, height }
}

async function measureImage(
  uri: string
): Promise<{ width: number; height: number } | null> {
  try {
    const { width, height } = await ImageManipulator.manipulateAsync(uri, [])
    return { width, height }
  } catch {
    return null
  }
}
