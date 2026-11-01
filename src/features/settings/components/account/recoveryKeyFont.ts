import { Platform } from 'react-native'

export const RECOVERY_KEY_FONT = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
})
