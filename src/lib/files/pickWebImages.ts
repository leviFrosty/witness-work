import type {
  ImagePickerAsset,
  ImagePickerOptions,
  ImagePickerResult,
} from 'expo-image-picker'
import { MAX_PHOTO_BYTES } from '@/lib/files/imageSizing'
import { pickFiles } from '@/lib/files/pickFiles'
import { readImageSize, UnsupportedImageError } from '@/lib/files/webImages'

/**
 * Whether the device is a phone or tablet, whose browsers open the camera for a
 * file chooser's `capture`. A desktop browser would just open a file dialog, so
 * "Take Photo" is hidden there.
 */
export const canCapturePhotos = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(pointer: coarse)').matches &&
  matchMedia('(hover: none)').matches

const toAsset = async (file: File): Promise<ImagePickerAsset> => {
  if (file.size > MAX_PHOTO_BYTES) throw new UnsupportedImageError('tooLarge')
  // Reads the size, which also proves the browser can open the file.
  const { width, height } = await readImageSize(file)
  return {
    uri: URL.createObjectURL(file),
    width,
    height,
    type: 'image',
    mimeType: file.type || undefined,
    fileName: file.name,
    fileSize: file.size,
    file,
    exif: null,
  }
}

/**
 * Picks photos from a file input, in the shape `expo-image-picker` returns. It
 * stands in for `launchImageLibraryAsync` and `launchCameraAsync` on the web,
 * whose own versions hand back a photo the browser can't open as 0×0 and never
 * check its size. Files that aren't usable photos are skipped; when none is,
 * this throws `UnsupportedImageError`, so callers show the same "couldn't be
 * opened" message as a failed pick. The assets' object URLs live until the page
 * closes.
 */
export async function pickWebImages(
  options: Pick<
    ImagePickerOptions,
    'allowsMultipleSelection' | 'selectionLimit'
  >,
  source: 'library' | 'camera' = 'library'
): Promise<ImagePickerResult> {
  const multiple = source === 'library' && !!options.allowsMultipleSelection
  const files = await pickFiles({
    accept: 'image/*',
    multiple,
    capture: source === 'camera' ? 'environment' : undefined,
  })
  const limit = multiple ? options.selectionLimit || files.length : 1
  const picked = files.slice(0, limit)
  if (!picked.length) return { canceled: true, assets: null }

  const settled = await Promise.allSettled(picked.map(toAsset))
  const assets = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []
  )
  if (!assets.length) {
    const failure = settled.find((result) => result.status === 'rejected')
    throw failure?.status === 'rejected'
      ? failure.reason
      : new UnsupportedImageError('unsupported')
  }
  return { canceled: false, assets }
}
