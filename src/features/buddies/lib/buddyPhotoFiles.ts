import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'react-native'
import { useProfile } from '@/stores/profile'
import { localSharedPhotoId } from '@/features/buddies/lib/sharedNotes'
import {
  base64ToBytes,
  bytesToBase64,
} from '@/features/buddies/lib/sharedPhotoFiles'

const FULL_PHOTO_SIZE = 1024

const DIRECTORY = `${FileSystem.cacheDirectory}buddy-photos/`

export async function readProfilePhoto(): Promise<Uint8Array | null> {
  const { avatar } = useProfile.getState()
  if (avatar.type !== 'image' || !avatar.value.startsWith('file://'))
    return null

  const path = avatar.value.split('?')[0]
  const { width, height } = await Image.getSize(path)
  const result = await ImageManipulator.manipulateAsync(
    path,
    Math.max(width, height) > FULL_PHOTO_SIZE
      ? [
          {
            resize:
              width >= height
                ? { width: FULL_PHOTO_SIZE }
                : { height: FULL_PHOTO_SIZE },
          },
        ]
      : [],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  )
  void FileSystem.deleteAsync(result.uri, { idempotent: true })
  return result.base64 ? base64ToBytes(result.base64) : null
}

const photoPath = (blobId: string) =>
  `${DIRECTORY}${localSharedPhotoId(blobId)}.jpg`

export async function buddyPhotoFile(blobId: string): Promise<string | null> {
  const path = photoPath(blobId)
  return (await FileSystem.getInfoAsync(path)).exists ? path : null
}

export async function saveBuddyPhoto(
  blobId: string,
  bytes: Uint8Array
): Promise<string> {
  await FileSystem.makeDirectoryAsync(DIRECTORY, { intermediates: true })
  const path = photoPath(blobId)
  await FileSystem.writeAsStringAsync(path, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  })
  return path
}

let kept: string | null = null

export async function keepBuddyPhotos(blobIds: string[]): Promise<void> {
  const signature = [...blobIds].sort().join()
  if (signature === kept) return
  const keep = new Set(blobIds.map((id) => `${localSharedPhotoId(id)}.jpg`))
  const files = await FileSystem.readDirectoryAsync(DIRECTORY).catch(
    () => [] as string[]
  )
  await Promise.all(
    files
      .filter((file) => !keep.has(file))
      .map((file) =>
        FileSystem.deleteAsync(`${DIRECTORY}${file}`, { idempotent: true })
      )
  )
  kept = signature
}
