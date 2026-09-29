import { useToastController } from '@tamagui/toast'
import * as Clipboard from 'expo-clipboard'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'

/** Copies text for a map menu item and confirms it with a toast. */
export default function useCopyText() {
  const toast = useToastController()

  return async (text: string) => {
    try {
      await Clipboard.setStringAsync(text)
      void Haptics.success()
      toast.show(i18n.t('copied'), { native: true, duration: 2000 })
    } catch {
      void Haptics.error()
    }
  }
}
