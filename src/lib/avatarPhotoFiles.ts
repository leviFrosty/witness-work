import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import {
  deleteWebPhoto,
  listWebPhotos,
  webPhotoPath,
  webPhotoPathId,
  webPhotosReady,
} from '@/lib/files/webPhotoStore'

const WEB_AVATAR_FOLDER = 'avatars/'

export const WEB_AVATAR_DIRECTORY = webPhotoPath(WEB_AVATAR_FOLDER)

export const avatarDirectory = (): string =>
  Platform.OS === 'web'
    ? WEB_AVATAR_DIRECTORY
    : (FileSystem.documentDirectory ?? '')

const withoutQuery = (path: string) => path.split('?')[0]

export async function deleteAvatarFile(path: string): Promise<void> {
  const id = webPhotoPathId(withoutQuery(path))
  if (id !== undefined) return deleteWebPhoto(id)
  await FileSystem.deleteAsync(path, { idempotent: true })
}

export async function listAvatarFiles(): Promise<string[]> {
  if (Platform.OS !== 'web') {
    const directory = FileSystem.documentDirectory
    return directory ? FileSystem.readDirectoryAsync(directory) : []
  }
  await webPhotosReady()
  return listWebPhotos()
    .map(({ id }) => id)
    .filter((id) => id.startsWith(WEB_AVATAR_FOLDER))
    .map((id) => id.slice(WEB_AVATAR_FOLDER.length))
}
