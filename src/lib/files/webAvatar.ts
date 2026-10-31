import { deliverExport, prepareExport } from '@/lib/files/exportFile'
import { logger } from '@/lib/logger'

/** The avatar's JPEG bytes as base64, from the `data:` URL the record holds. */
const avatarBase64 = (dataUrl: string) =>
  dataUrl.slice(dataUrl.indexOf(',') + 1)

const fileNameFor = (name: string) =>
  `${name.replace(/[^\p{L}\p{N}]+/gu, '_') || 'photo'}.jpg`

/** Web "Save": downloads the contact's photo. */
export async function downloadAvatar(
  value: string,
  contactName: string
): Promise<void> {
  try {
    if (!value.startsWith('data:')) return
    await deliverExport(
      await prepareExport({
        fileName: fileNameFor(contactName),
        mimeType: 'image/jpeg',
        base64: avatarBase64(value),
        purpose: 'save',
      })
    )
  } catch (error) {
    logger.warn('Download avatar failed', error)
  }
}

/** Web "Share": the share sheet on phones, a download elsewhere. */
export async function shareAvatar(
  value: string,
  contactName: string
): Promise<void> {
  try {
    if (!value.startsWith('data:')) return
    await deliverExport(
      await prepareExport({
        fileName: fileNameFor(contactName),
        mimeType: 'image/jpeg',
        base64: avatarBase64(value),
        dialogTitle: contactName,
        purpose: 'send',
      })
    )
  } catch (error) {
    logger.warn('Share avatar failed or was cancelled', error)
  }
}
