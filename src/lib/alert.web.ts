import type { AlertButton } from 'react-native'

/**
 * React Native Web's `Alert.alert` does nothing, so the browser's own dialogs
 * stand in: `confirm` for Cancel and one action (OK runs the action), `alert`
 * for a notice. With more than one action, only the first is offered.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons: AlertButton[] = []
): void {
  const text = message ? `${title}\n\n${message}` : title
  const cancel = buttons.find((button) => button.style === 'cancel')
  const [action] = buttons.filter((button) => button !== cancel)
  if (!action) {
    window.alert(text)
    cancel?.onPress?.()
    return
  }
  if (window.confirm(text)) action.onPress?.()
  else cancel?.onPress?.()
}
