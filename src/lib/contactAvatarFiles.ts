import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { logger } from '@/lib/logger'
import { avatarPhotoEncoding, resizeToFit } from '@/lib/photoEncoding'
import {
  avatarDirectory,
  deleteAvatarFile,
  listAvatarFiles,
} from '@/lib/avatarPhotoFiles'
import { putWebPhoto, webPhotoPathId } from '@/lib/files/webPhotoStore'
import {
  avatarFileContactId,
  isInlineImage,
  isManagedAvatarPath,
  originalSiblingFileName,
} from '@/lib/avatarFilePolicy'

export { originalSiblingFileName } from '@/lib/avatarFilePolicy'

const CROPPED_PREFIX = 'contact-'
const CROPPED_SUFFIX = '-avatar.jpg'

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
  return `${avatarDirectory()}${croppedAvatarFileName(contactId, revision)}`
}

export function originalAvatarPath(
  contactId: string,
  revision?: string
): string {
  return `${avatarDirectory()}${originalAvatarFileName(contactId, revision)}`
}

export function stripCacheBuster(uri: string): string {
  if (isInlineImage(uri)) return uri
  const q = uri.indexOf('?')
  return q === -1 ? uri : uri.slice(0, q)
}

export function withCacheBuster(path: string): string {
  return isInlineImage(path) ? path : `${path}?t=${Date.now()}`
}

export async function originalExists(
  contactId: string,
  revision?: string
): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const info = await FileSystem.getInfoAsync(
    originalAvatarPath(contactId, revision)
  )
  return info.exists
}

const WEB_AVATAR_MAX_SIDE = 1024
const WEB_AVATAR_QUALITY = 0.85

async function cropAvatarInBrowser(
  srcUri: string,
  destPath: string,
  rect: CropRect
): Promise<{ path: string; width: number; height: number }> {
  const { renderJpeg, blobToDataUrl } = await import('@/lib/files/webImages')
  const encoding = avatarPhotoEncoding()
  const { blob, width, height } = await renderJpeg(stripCacheBuster(srcUri), {
    crop: rect,
    maxSide: encoding.optimized
      ? Math.min(WEB_AVATAR_MAX_SIDE, encoding.maxSide ?? WEB_AVATAR_MAX_SIDE)
      : WEB_AVATAR_MAX_SIDE,
    quality: encoding.optimized ? encoding.quality : WEB_AVATAR_QUALITY,
  })
  const id = webPhotoPathId(destPath)
  if (id === undefined)
    return { path: await blobToDataUrl(blob), width, height }
  putWebPhoto(id, blob)
  return { path: destPath, width, height }
}

export interface CropRect {
  originX: number

  originY: number

  width: number

  height: number
}

export async function cropAndSaveImage(
  srcUri: string,
  destPath: string,
  rect: CropRect,
  source: { width: number; height: number }
): Promise<{ path: string; width: number; height: number }> {
  if (Platform.OS === 'web') return cropAvatarInBrowser(srcUri, destPath, rect)
  const safeRect: CropRect = {
    originX: Math.max(0, Math.min(rect.originX, source.width - 1)),
    originY: Math.max(0, Math.min(rect.originY, source.height - 1)),
    width: Math.max(1, Math.min(rect.width, source.width - rect.originX)),
    height: Math.max(1, Math.min(rect.height, source.height - rect.originY)),
  }
  const { maxSide, quality } = avatarPhotoEncoding()
  const resize = resizeToFit(safeRect, maxSide)
  const result = await ImageManipulator.manipulateAsync(
    stripCacheBuster(srcUri),
    [{ crop: safeRect }, ...(resize ? [{ resize }] : [])],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
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

export async function deleteAvatarFiles(contactId: string): Promise<void> {
  const directory = avatarDirectory()
  if (!directory) return
  const paths = new Set([
    croppedAvatarPath(contactId),
    originalAvatarPath(contactId),
  ])
  try {
    for (const file of await listAvatarFiles()) {
      if (avatarFileContactId(file) === contactId)
        paths.add(`${directory}${file}`)
    }
  } catch (error) {
    logger.warn('Failed to enumerate avatar revisions', error)
  }
  for (const path of paths) {
    if (!isManagedAvatarPath(path, directory)) continue
    try {
      await deleteAvatarFile(path)
    } catch (e) {
      logger.warn('Failed to delete avatar file', path, e)
    }
  }
}
