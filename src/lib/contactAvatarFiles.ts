import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { logger } from '@/lib/logger'
import {
  avatarFileContactId,
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
  return `${FileSystem.documentDirectory}${croppedAvatarFileName(contactId, revision)}`
}

export function originalAvatarPath(
  contactId: string,
  revision?: string
): string {
  return `${FileSystem.documentDirectory}${originalAvatarFileName(contactId, revision)}`
}

export function stripCacheBuster(uri: string): string {
  const q = uri.indexOf('?')
  return q === -1 ? uri : uri.slice(0, q)
}

export function withCacheBuster(path: string): string {
  return `${path}?t=${Date.now()}`
}

export async function originalExists(
  contactId: string,
  revision?: string
): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(
    originalAvatarPath(contactId, revision)
  )
  return info.exists
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
