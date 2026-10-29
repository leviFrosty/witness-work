import * as FileSystem from 'expo-file-system/legacy'
import { randomUUID } from 'expo-crypto'
import type { ImagePickerAsset } from 'expo-image-picker'
import { Asset } from 'expo-media-library'

/** Where the system picker leaves its copies, so both pickers share a cache. */
const PICKED_DIR = `${FileSystem.cacheDirectory}ImagePicker/`

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic',
  heif: 'image/heif',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

/**
 * The system picker's EXIF shape: the `{Exif}` tags, with `{TIFF}` (camera,
 * date) beside them and `{GPS}` tags prefixed with `GPS`.
 */
function pickerExif(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const group = (key: string) =>
    (properties[key] ?? {}) as Record<string, unknown>
  const exif: Record<string, unknown> = { ...group('{TIFF}') }
  Object.assign(exif, group('{Exif}'))
  for (const [key, value] of Object.entries(group('{GPS}')))
    exif[`GPS${key}`] = value
  return exif
}

/**
 * Copies a photo the app can read (limited library access) into the cache, in
 * the shape the system picker returns, so callers treat both pickers alike:
 * they own the copy and may move or delete it. A photo kept only in iCloud
 * downloads first.
 */
export async function copyLibraryPhoto(
  id: string,
  options: { exif: boolean }
): Promise<ImagePickerAsset> {
  const asset = new Asset(id)
  const info = await asset.getInfo()
  const extension = (
    info.uri.split('?')[0].split('.').pop() ?? 'jpg'
  ).toLowerCase()
  await FileSystem.makeDirectoryAsync(PICKED_DIR, { intermediates: true })
  const uri = `${PICKED_DIR}${randomUUID()}.${extension}`
  await FileSystem.copyAsync({ from: info.uri, to: uri })
  const file = await FileSystem.getInfoAsync(uri)
  return {
    uri,
    assetId: info.id,
    width: info.width,
    height: info.height,
    type: 'image',
    fileName: info.filename,
    fileSize: file.exists ? file.size : undefined,
    mimeType: MIME_TYPES[extension],
    exif: options.exif ? pickerExif(await asset.getExif()) : null,
  }
}
