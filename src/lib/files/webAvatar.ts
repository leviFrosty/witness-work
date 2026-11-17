import { deliverExport, prepareExport } from '@/lib/files/exportFile'
import { logger } from '@/lib/logger'
import { getWebPhotoBlob, webPhotoPathId } from '@/lib/files/webPhotoStore'
import { blobToDataUrl } from '@/lib/files/webImages'

async function avatarBase64(value: string): Promise<string | null> {
  const id = webPhotoPathId(value.split('?')[0])
  const blob = id === undefined ? undefined : await getWebPhotoBlob(id)
  const dataUrl = blob ? await blobToDataUrl(blob) : value
  if (!dataUrl.startsWith('data:')) return null
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

const fileNameFor = (name: string) =>
  `${name.replace(/[^\p{L}\p{N}]+/gu, '_') || 'photo'}.jpg`

export async function downloadAvatar(
  value: string,
  contactName: string
): Promise<void> {
  try {
    const base64 = await avatarBase64(value)
    if (!base64) return
    await deliverExport(
      await prepareExport({
        fileName: fileNameFor(contactName),
        mimeType: 'image/jpeg',
        base64,
        purpose: 'save',
      })
    )
  } catch (error) {
    logger.warn('Download avatar failed', error)
  }
}

export async function shareAvatar(
  value: string,
  contactName: string
): Promise<void> {
  try {
    const base64 = await avatarBase64(value)
    if (!base64) return
    await deliverExport(
      await prepareExport({
        fileName: fileNameFor(contactName),
        mimeType: 'image/jpeg',
        base64,
        dialogTitle: contactName,
        purpose: 'send',
      })
    )
  } catch (error) {
    logger.warn('Share avatar failed or was cancelled', error)
  }
}
