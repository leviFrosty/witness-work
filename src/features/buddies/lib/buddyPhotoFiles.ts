import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'react-native'
import { useProfile } from '@/stores/profile'
import { localSharedPhotoId } from '@/features/buddies/lib/sharedNotes'
import {
  base64ToBytes,
  bytesToBase64,
} from '@/features/buddies/lib/sharedPhotoFiles'

/*
 * Profile photos at full size, opened by tapping a buddy's avatar: this User's
 * own, read to upload, and buddies', downloaded the first time one is opened
 * and kept while their card links them. Buddies' live in the cache folder: if
 * the system clears it, the next open downloads the photo again.
 */

/** Sharp at the size an opened avatar is shown on any phone or tablet. */
const FULL_PHOTO_SIZE = 1024

const DIRECTORY = `${FileSystem.cacheDirectory}buddy-photos/`

/**
 * The Profile photo as JPEG bytes for buddies to open full size, no bigger than
 * `FULL_PHOTO_SIZE`; null when there's no photo.
 */
export async function readProfilePhoto(): Promise<Uint8Array | null> {
  const { avatar } = useProfile.getState()
  if (avatar.type !== 'image' || !avatar.value.startsWith('file://'))
    return null
  // Drop the `?t=` cache-buster; it isn't part of the file path.
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

/** A buddy's downloaded photo, or null before it's downloaded. */
export async function buddyPhotoFile(blobId: string): Promise<string | null> {
  const path = photoPath(blobId)
  return (await FileSystem.getInfoAsync(path)).exists ? path : null
}

/** Keeps a buddy's photo (JPEG bytes) and returns its file. */
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

/** The blob ids last kept, so an unchanged list doesn't read the folder. */
let kept: string | null = null

/** Deletes buddies' downloaded photos of every blob not in `blobIds`. */
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
