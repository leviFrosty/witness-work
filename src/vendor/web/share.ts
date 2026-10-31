import * as Clipboard from 'expo-clipboard'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'

/**
 * Stands in for react-native-web's `Share` in the web build (see
 * `metro/bundleRedirects.js`). Theirs resolves `undefined`, so every caller
 * that reads `result.action` throws, and it rejects where the browser has no
 * share sheet. This one:
 *
 * - Opens the browser's share sheet on phones and tablets, where that is how
 *   people send text on, and says `dismissedAction` when it's closed;
 * - Copies the text to the clipboard everywhere else (desktop browsers' share
 *   sheets are rare and surprising), with the "Copied!" toast, and says
 *   `sharedAction`.
 *
 * Files don't come through here: `@/lib/files/exportFile` downloads them.
 */

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
        // Refused (the tap's permission lapsed, or no share target): copy.
      }
    }
    const text = [content.message, content.url].filter(Boolean).join('\n')
    // `false` is a copy the browser refused: don't claim it was shared.
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
