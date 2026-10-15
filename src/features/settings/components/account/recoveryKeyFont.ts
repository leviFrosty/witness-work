import { Platform } from 'react-native'

/** Monospaced, so every group lines up and 0/O and 1/I read apart. */
export const RECOVERY_KEY_FONT = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
})
