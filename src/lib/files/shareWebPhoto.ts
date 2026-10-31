import { deliverExport, prepareExport } from '@/lib/files/exportFile'
import { getWebPhotoBlob } from '@/lib/files/webPhotoStore'
import { logger } from '@/lib/logger'

/** The viewer's Share: a phone's share sheet, a download elsewhere. */
export default async function shareWebPhoto(id: string): Promise<void> {
  const blob = getWebPhotoBlob(id)
  if (!blob) return
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    await deliverExport(
      await prepareExport({
        fileName: `photo-${id.slice(0, 8)}.jpg`,
        mimeType: 'image/jpeg',
        base64: globalThis.btoa(binary),
        purpose: 'send',
      })
    )
  } catch (error) {
    logger.warn('Share photo failed or was cancelled', error)
  }
}
