import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { useToastController } from '@tamagui/toast'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import type { PlayerInput } from '@/features/pet/art'
import { localDayKey } from '@/features/pet/lib/dayKeys'
import { petShareFileName, petShareImage } from '@/features/pet/lib/share'
import { bufferToPngBase64 } from '@/features/pet/render/skiaImage'

/**
 * Share… on the pet card: the room as Home shows it, as a crisp PNG in the
 * share sheet. The file goes to the cache folder (the share sheet reads it by
 * reference, so it can't be deleted right away; the OS clears the cache).
 */
export default function useSharePet() {
  const toast = useToastController()
  return async (input: PlayerInput, name: string) => {
    try {
      const png = bufferToPngBase64(petShareImage(input))
      if (!png || !(await Sharing.isAvailableAsync()))
        throw new Error('Pet picture or share sheet unavailable')
      const uri = `${FileSystem.cacheDirectory}${petShareFileName(name, localDayKey())}`
      await FileSystem.writeAsStringAsync(uri, png, {
        encoding: FileSystem.EncodingType.Base64,
      })
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: i18n.t('pet.share.dialogTitle', { name }),
      })
      analytics.capture('pet_shared')
    } catch (error) {
      logger.error('Sharing the pet failed', error)
      toast.show(i18n.t('pet.share.failed'), { native: true })
    }
  }
}
