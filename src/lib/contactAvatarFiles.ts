import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { logger } from '@/lib/logger'
import {
  avatarFileContactId,
  isManagedAvatarPath,
  originalSiblingFileName,
} from '@/lib/avatarFilePolicy'

export { originalSiblingFileName } from '@/lib/avatarFilePolicy'

/**
 * On-disk layout for a contact's image avatar.
 *
 * Cropped picks and local-only originals have immutable revision paths. A
 * pending draft therefore cannot overwrite another photo's source, and cleanup
 * of a remote replacement cannot delete the pending draft's original. Legacy
 * records without revisions retain their canonical filenames.
 */

const CROPPED_PREFIX = 'contact-'
const CROPPED_SUFFIX = '-avatar.jpg'

/** New cropped bytes use immutable paths so an upload cannot read a later pick. */
export function revisionImageFileName(
  fileName: string,
  revision: string
): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0
    ? `${fileName}-picked-${revision}`
    : `${fileName.slice(0, dot)}-picked-${revision}${fileName.slice(dot)}`
}

export function croppedAvatarFileName(
  contactId: string,
  revision?: string
): string {
  const fileName = `${CROPPED_PREFIX}${contactId}${CROPPED_SUFFIX}`
  return revision ? revisionImageFileName(fileName, revision) : fileName
}

export function originalAvatarFileName(
  contactId: string,
  revision?: string
): string {
  return originalSiblingFileName(croppedAvatarFileName(contactId), revision)
}

export function croppedAvatarPath(
  contactId: string,
  revision?: string
): string {
  return `${FileSystem.documentDirectory}${croppedAvatarFileName(contactId, revision)}`
}

export function originalAvatarPath(
  contactId: string,
  revision?: string
): string {
  return `${FileSystem.documentDirectory}${originalAvatarFileName(contactId, revision)}`
}

/**
 * Strip the `?t=…` cache-buster off an avatar `value` so it can be passed to
 * filesystem APIs. `<Image>` keeps the buster; `FileSystem` cannot.
 */
export function stripCacheBuster(uri: string): string {
  if (isInlineImage(uri)) return uri
  const q = uri.indexOf('?')
  return q === -1 ? uri : uri.slice(0, q)
}

export function withCacheBuster(path: string): string {
  // Inline images (the web's) can't take a query, and never share a URI.
  return isInlineImage(path) ? path : `${path}?t=${Date.now()}`
}

/** A `data:` or `blob:` URL, which holds its own bytes instead of naming a file. */
const isInlineImage = (uri: string) =>
  uri.startsWith('data:') || uri.startsWith('blob:')

export async function originalExists(
  contactId: string,
  revision?: string
): Promise<boolean> {
  // The web keeps no originals beside the avatar (ADR 0040 §6 will carry them).
  if (Platform.OS === 'web') return false
  const info = await FileSystem.getInfoAsync(
    originalAvatarPath(contactId, revision)
  )
  return info.exists
}

/** The longest side of a web avatar; it's shown small, and stored in the record. */
const WEB_AVATAR_MAX_SIDE = 1024
const WEB_AVATAR_QUALITY = 0.85

/**
 * The web has no files to write to: the cropped, downscaled JPEG is the
 * avatar's value, a `data:` URL the record carries (and Cloud Sync's photo pass
 * takes from, docs/web-files.md).
 */
async function cropAvatarInBrowser(
  srcUri: string,
  rect: CropRect
): Promise<{ path: string; width: number; height: number }> {
  const { renderJpeg, blobToDataUrl } = await import('@/lib/files/webImages')
  const { blob, width, height } = await renderJpeg(stripCacheBuster(srcUri), {
    crop: rect,
    maxSide: WEB_AVATAR_MAX_SIDE,
    quality: WEB_AVATAR_QUALITY,
  })
  return { path: await blobToDataUrl(blob), width, height }
}

export interface CropRect {
  /** Top-left X in the source image's pixel coordinates. */
  originX: number
  /** Top-left Y in the source image's pixel coordinates. */
  originY: number
  /** Width of the crop in source pixels. */
  width: number
  /** Height of the crop in source pixels. */
  height: number
}

/**
 * Crop a source image to `rect` and persist the result at `destPath`.
 *
 * Generic because the same pipeline serves both contact avatars (`destPath` =
 * `croppedAvatarPath(contactId)`) and the user's profile avatar
 * (`<documentDirectory>/profile-avatar.jpg`). `rect` is in source-image pixel
 * coordinates and is clamped to bounds before being passed to the manipulator
 * (out-of-bounds crops throw on iOS).
 */
export async function cropAndSaveImage(
  srcUri: string,
  destPath: string,
  rect: CropRect,
  source: { width: number; height: number }
): Promise<{ path: string; width: number; height: number }> {
  if (Platform.OS === 'web') return cropAvatarInBrowser(srcUri, rect)
  const safeRect: CropRect = {
    originX: Math.max(0, Math.min(rect.originX, source.width - 1)),
    originY: Math.max(0, Math.min(rect.originY, source.height - 1)),
    width: Math.max(1, Math.min(rect.width, source.width - rect.originX)),
    height: Math.max(1, Math.min(rect.height, source.height - rect.originY)),
  }
  const result = await ImageManipulator.manipulateAsync(
    stripCacheBuster(srcUri),
    [{ crop: safeRect }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  )

  try {
    await FileSystem.deleteAsync(destPath, { idempotent: true })
    await FileSystem.copyAsync({ from: result.uri, to: destPath })
  } catch (e) {
    logger.warn('Failed to write cropped image', e)
    throw e
  }

  return { path: destPath, width: result.width, height: result.height }
}

/**
 * Contact-specific convenience wrapper around `cropAndSaveImage` that targets
 * the canonical cropped-avatar path for a contact id.
 */
export function cropAndSaveAvatar(
  srcUri: string,
  contactId: string,
  rect: CropRect,
  source: { width: number; height: number },
  revision?: string
): Promise<{ path: string; width: number; height: number }> {
  return cropAndSaveImage(
    srcUri,
    croppedAvatarPath(contactId, revision),
    rect,
    source
  )
}

/**
 * Centered square crop of the given source dimensions. Used by the crop editor
 * as the default frame and by "Reset" to revert to the un-customised state.
 */
export function defaultCenteredSquareCrop(source: {
  width: number
  height: number
}): CropRect {
  const side = Math.min(source.width, source.height)
  return {
    originX: Math.floor((source.width - side) / 2),
    originY: Math.floor((source.height - side) / 2),
    width: side,
    height: side,
  }
}

/**
 * Best-effort cleanup of all on-disk avatar files for a contact. Called when a
 * user explicitly erases householder data. Errors are swallowed since the
 * caller cares about the in-memory state, not whether the disk eviction
 * succeeded.
 */
export async function deleteAvatarFiles(contactId: string): Promise<void> {
  if (!FileSystem.documentDirectory) return
  const paths = new Set([
    croppedAvatarPath(contactId),
    originalAvatarPath(contactId),
  ])
  try {
    const files = await FileSystem.readDirectoryAsync(
      FileSystem.documentDirectory
    )
    for (const file of files) {
      if (avatarFileContactId(file) === contactId)
        paths.add(`${FileSystem.documentDirectory}${file}`)
    }
  } catch (error) {
    logger.warn('Failed to enumerate avatar revisions', error)
  }
  for (const path of paths) {
    if (!isManagedAvatarPath(path, FileSystem.documentDirectory)) continue
    try {
      await FileSystem.deleteAsync(path, { idempotent: true })
    } catch (e) {
      logger.warn('Failed to delete avatar file', path, e)
    }
  }
}
