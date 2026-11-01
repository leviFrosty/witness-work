import { toast } from '@/stores/toasts'
import * as Clipboard from 'expo-clipboard'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'

export default function useCopyText() {
  return async (text: string) => {
    try {
      await Clipboard.setStringAsync(text)
      void Haptics.success()
      toast.success(i18n.t('copied'), { durationMs: 2000 })
    } catch {
      void Haptics.error()
    }
  }
}
