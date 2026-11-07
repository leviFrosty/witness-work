import type { AlertButton } from 'react-native'

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
