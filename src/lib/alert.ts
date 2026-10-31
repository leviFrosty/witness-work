import { Alert, type AlertButton } from 'react-native'

/**
 * `Alert.alert`, for a dialog the web build must show too (`alert.web.ts`):
 * React Native Web's own does nothing.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
): void {
  Alert.alert(title, message, buttons)
}
