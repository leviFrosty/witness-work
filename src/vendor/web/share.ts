import * as Clipboard from 'expo-clipboard'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'

type Content = { title?: string; message?: string; url?: string }
type Result = { action: 'sharedAction' | 'dismissedAction' }

const isTouchDevice = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(pointer: coarse)').matches &&
  matchMedia('(hover: none)').matches

class Share {
  static async share(content: Content): Promise<Result> {
    if (isTouchDevice() && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: content.title,
          text: content.message,
          url: content.url,
        })
        return { action: Share.sharedAction }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError')
          return { action: Share.dismissedAction }
      }
    }
    const text = [content.message, content.url].filter(Boolean).join('\n')

    if (!(await Clipboard.setStringAsync(text)))
      return { action: Share.dismissedAction }
    toast.success(i18n.t('copied'))
    return { action: Share.sharedAction }
  }

  static get sharedAction() {
    return 'sharedAction' as const
  }

  static get dismissedAction() {
    return 'dismissedAction' as const
  }
}

export default Share
