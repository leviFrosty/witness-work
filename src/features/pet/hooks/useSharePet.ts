import type { RefObject } from 'react'
import type { View } from 'react-native'
import { ImageFormat, makeImageFromView } from '@shopify/react-native-skia'
import { analytics } from '@/lib/analytics'
import {
  canExportFiles,
  deliverExport,
  prepareExport,
} from '@/lib/files/exportFile'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import { logger } from '@/lib/logger'
import { localDayKey } from '@/features/pet/lib/dayKeys'
import { petShareFileName } from '@/features/pet/lib/share'

/**
 * Share on the pet's share sheet: a snapshot of its card (`PetShareCard`) at
 * the screen's pixel density, as a PNG in the share sheet. The file goes to the
 * cache folder (the share sheet reads it by reference, so it can't be deleted
 * right away; the OS clears the cache).
 */
export default function useSharePet() {
  return async (
    card: RefObject<View | null>,
    name: string,
    showSign: boolean
  ) => {
    try {
      const image = await makeImageFromView(card)
      const png = image?.encodeToBase64(ImageFormat.PNG, 100)
      image?.dispose()
      if (!png || !(await canExportFiles()))
        throw new Error('Pet card or share sheet unavailable')
      await deliverExport(
        await prepareExport({
          fileName: petShareFileName(name, localDayKey()),
          mimeType: 'image/png',
          uti: 'public.png',
          dialogTitle: i18n.t('pet.share.dialogTitle', { name }),
          base64: png,
          purpose: 'send',
        })
      )
      analytics.capture('pet_shared', { sign: showSign })
    } catch (error) {
      logger.error('Sharing the pet failed', error)
      toast.error(i18n.t('pet.share.failed'))
    }
  }
}
