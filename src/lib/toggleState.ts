import { Platform } from 'react-native'

export const toggleState = (active: boolean, disabled = false) =>
  Platform.OS === 'web'
    ? ({ accessibilityState: { disabled }, 'aria-pressed': active } as const)
    : ({ accessibilityState: { selected: active, disabled } } as const)
