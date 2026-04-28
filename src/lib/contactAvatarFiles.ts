import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { logger } from './logger'

/**
 * On-disk layout for a contact's image avatar.
 *
 * - `<id>-avatar.jpg` (cropped, displayed) — what `Contact.avatar.value` points
 *   at. Synced to iCloud as `witness-work-img-contact-<id>.jpg` via the regular
 *   image-sync pipeline.
 * - `<id>-avatar-original.jpg` (uncropped source) — local-only. Lets the crop
 *   editor re-crop the image without quality loss across passes. Receivers of a
 *   synced avatar do not get the original — see `avatarMeta` doc on Contact.
 *
 * The cropped file is what every existing call site already writes; the
 * original is new and additive, so legacy contacts simply have no original on
 * disk and the crop editor falls back to the displayed image as the source.
 */

const CROPPED_PREFIX = 'contact-'
const CROPPED_SUFFIX = '-avatar.jpg'
const ORIGINAL_SUFFIX = '-avatar-original.jpg'

export function croppedAvatarFileName(contactId: string): string {
  return `${CROPPED_PREFIX}${contactId}${CROPPED_SUFFIX}`
}

export function originalAvatarFileName(contactId: string): string {
  return `${CROPPED_PREFIX}${contactId}${ORIGINAL_SUFFIX}`
}

export function croppedAvatarPath(contactId: string): string {
  return `${FileSystem.documentDirectory}${croppedAvatarFileName(contactId)}`
}

export function originalAvatarPath(contactId: string): string {
  return `${FileSystem.documentDirectory}${originalAvatarFileName(contactId)}`
}

/**
 * Strip the `?t=…` cache-buster off an avatar `value` so it can be passed to
 * filesystem APIs. `<Image>` keeps the buster; `FileSystem` cannot.
 */
export function stripCacheBuster(uri: string): string {
  const q = uri.indexOf('?')
  return q === -1 ? uri : uri.slice(0, q)
}

export function withCacheBuster(path: string): string {
  return `${path}?t=${Date.now()}`
}

export async function originalExists(contactId: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(originalAvatarPath(contactId))
  return info.exists
}

/**
 * Copy a freshly-picked image into the documents directory as the canonical
 * "original" for this contact, then read back its on-disk size and pixel
 * dimensions. The dimensions are sourced from a no-op manipulator call —
 * `getInfoAsync` doesn't decode the image, so it can't give us width/height.
 */
export async function saveOriginalImage(
  srcUri: string,
  contactId: string
): Promise<{ path: string; size?: number; width: number; height: number }> {
  const dest = originalAvatarPath(contactId)
  await FileSystem.deleteAsync(dest, { idempotent: true })
  await FileSystem.copyAsync({ from: srcUri, to: dest })

  const info = await FileSystem.getInfoAsync(dest)
  const dims = await ImageManipulator.manipulateAsync(dest, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  })

  return {
    path: dest,
    size: info.exists ? info.size : undefined,
    width: dims.width,
    height: dims.height,
  }
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
  source: { width: number; height: number }
): Promise<{ path: string; width: number; height: number }> {
  return cropAndSaveImage(srcUri, croppedAvatarPath(contactId), rect, source)
}

/**
 * Sibling "-original" filename for any given displayed-image filename. Used by
 * the avatar picker so the original-source policy applies uniformly to both
 * contact avatars (`contact-<id>-avatar.jpg` →
 * `contact-<id>-avatar-original.jpg`) and the profile avatar
 * (`profile-avatar.jpg` → `profile-avatar-original.jpg`).
 */
export function originalSiblingFileName(croppedFileName: string): string {
  const dotIdx = croppedFileName.lastIndexOf('.')
  if (dotIdx === -1) return `${croppedFileName}-original`
  return `${croppedFileName.slice(0, dotIdx)}-original${croppedFileName.slice(dotIdx)}`
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
 * Best-effort cleanup of all on-disk avatar files for a contact. Called when
 * the user clears the avatar entirely. Errors are swallowed since the caller
 * cares about the in-memory state, not whether the disk eviction succeeded.
 */
export async function deleteAvatarFiles(contactId: string): Promise<void> {
  for (const path of [
    croppedAvatarPath(contactId),
    originalAvatarPath(contactId),
  ]) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true })
    } catch (e) {
      logger.warn('Failed to delete avatar file', path, e)
    }
  }
}
