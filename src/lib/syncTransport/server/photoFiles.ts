import { Platform } from 'react-native'
import {
  getWebPhotoBlob,
  getWebPhotoInfo,
  putWebPhoto,
  webPhotoPathId,
  webPhotosReady,
} from '@/lib/files/webPhotoStore'
import type { PhotoFiles } from '@/lib/syncTransport/server/serverTransport'

const fileSystem = () => import('expo-file-system')

const nativePhotoFiles: PhotoFiles = {
  async size(path) {
    const { File } = await fileSystem()
    return new File(path).size ?? 0
  },
  async read(path) {
    const { File } = await fileSystem()
    return new File(path).bytes()
  },
  async write(path, bytes) {
    const { File } = await fileSystem()
    const part = new File(`${path}.part`)
    try {
      await part.write(bytes)
      await part.move(new File(path), { overwrite: true })
    } catch (error) {
      if (part.exists) part.delete()
      throw error
    }
  },
}

const webPhotoId = (path: string): string => {
  const id = webPhotoPathId(path)
  if (!id) throw new Error('Not a web photo path')
  return id
}

export const webPhotoFiles: PhotoFiles = {
  async size(path) {
    await webPhotosReady()
    return getWebPhotoInfo(webPhotoId(path))?.size ?? 0
  },
  async read(path) {
    await webPhotosReady()
    const blob = await getWebPhotoBlob(webPhotoId(path))
    if (!blob) throw new Error('This browser does not hold the photo')
    return new Uint8Array(await blob.arrayBuffer())
  },
  async write(path, bytes) {
    await webPhotosReady()
    putWebPhoto(
      webPhotoId(path),
      new Blob([bytes.slice().buffer], { type: 'image/jpeg' })
    )
  },
}

export async function webPhotoModifiedAt(path: string): Promise<number | null> {
  await webPhotosReady()
  const id = webPhotoPathId(path)
  return (id && getWebPhotoInfo(id)?.modifiedAt) || null
}

export const photoFiles: PhotoFiles =
  Platform.OS === 'web' ? webPhotoFiles : nativePhotoFiles
