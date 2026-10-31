import { toast } from '@/stores/toasts'

/**
 * Stands in for react-native-web's `Alert`, which does nothing, in the web
 * build (see `metro/bundleRedirects.js`), so an error or a question the app
 * raises with `Alert.alert` still reaches the User:
 *
 * - An alert with at most one button is a message: an error toast, as the app
 *   raises these to say something went wrong.
 * - One with a Cancel and an action is a question: the browser's confirm dialog,
 *   running the action on OK and Cancel's handler otherwise.
 *
 * It keeps the call sites working until the app has its own dialogs.
 */

type Button = {
  text?: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: (value?: string) => void
}

class Alert {
  static alert(title: string, message?: string, buttons?: Button[]): void {
    const cancel = buttons?.find((button) => button.style === 'cancel')
    const actions = (buttons ?? []).filter((button) => button !== cancel)
    if (!actions.length || (actions.length === 1 && !cancel)) {
      toast.error(title, message ? { message } : undefined)
      ;(actions[0] ?? cancel)?.onPress?.()
      return
    }
    const accepted = window.confirm(
      [title, message].filter(Boolean).join('\n\n')
    )
    if (accepted) actions[actions.length - 1].onPress?.()
    else cancel?.onPress?.()
  }
}

export default Alert
