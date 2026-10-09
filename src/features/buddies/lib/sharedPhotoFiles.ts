import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import {
  ensureNoteImageDirectory,
  markNoteImagesLocal,
  noteImageExists,
  noteImagePath,
} from '@/lib/richText/noteImages'
import type { RichTextImageAttrs } from '@/types/richText'
import { fromB64u, toB64u } from '@/features/buddies/lib/bytes'

/*
 * Note photos as files, for sharing them with buddies: the engine reads a
 * smaller copy to upload and keeps buddies' photos it downloads.
 */

/** Long edge of a shared photo: plenty on a phone, a quarter of the bytes. */
const SHARED_SIDE = 1600
/** The relay takes a photo up to 1 MiB, sealed. */
const MAX_SHARED_BYTES = 1024 * 1024 - 64
const QUALITIES = [0.75, 0.6, 0.45]

const base64ToBytes = (base64: string) =>
  fromB64u(base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))

function bytesToBase64(bytes: Uint8Array): string {
  const text = toB64u(bytes).replace(/-/g, '+').replace(/_/g, '/')
  return text + '='.repeat((4 - (text.length % 4)) % 4)
}

/** The photo as JPEG bytes to share, or null when its file is gone. */
export async function readSharedPhoto(
  image: RichTextImageAttrs
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  if (!(await noteImageExists(image.id))) return null
  const resize =
    Math.max(image.width, image.height) > SHARED_SIDE
      ? image.width >= image.height
        ? { width: SHARED_SIDE }
        : { height: SHARED_SIDE }
      : null
  for (const compress of QUALITIES) {
    const result = await ImageManipulator.manipulateAsync(
      noteImagePath(image.id),
      resize ? [{ resize }] : [],
      { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    )
    void FileSystem.deleteAsync(result.uri, { idempotent: true })
    if (!result.base64) return null
    const bytes = base64ToBytes(result.base64)
    if (bytes.length <= MAX_SHARED_BYTES) {
      return { bytes, width: result.width, height: result.height }
    }
  }
  return null
}

export const hasSharedPhoto = (localId: string) => noteImageExists(localId)

/** Keeps a buddy's shared photo where notes look for it. */
export async function saveSharedPhoto(
  localId: string,
  bytes: Uint8Array
): Promise<void> {
  await ensureNoteImageDirectory()
  await FileSystem.writeAsStringAsync(
    noteImagePath(localId),
    bytesToBase64(bytes),
    { encoding: FileSystem.EncodingType.Base64 }
  )
  markNoteImagesLocal([localId])
}
