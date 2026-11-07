import type {
  ImagePickerAsset,
  ImagePickerOptions,
  ImagePickerResult,
} from 'expo-image-picker'
import { MAX_PHOTO_BYTES } from '@/lib/files/imageSizing'
import { pickFiles } from '@/lib/files/pickFiles'
import { readImageSize, UnsupportedImageError } from '@/lib/files/webImages'

export const canCapturePhotos = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(pointer: coarse)').matches &&
  matchMedia('(hover: none)').matches

const toAsset = async (file: File): Promise<ImagePickerAsset> => {
  if (file.size > MAX_PHOTO_BYTES) throw new UnsupportedImageError('tooLarge')

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
