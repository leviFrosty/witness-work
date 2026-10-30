import { Platform } from 'react-native'

/**
 * Accessibility props for a button that is one of a set where one is chosen
 * (One Time | Recurring, List | Map). A native screen reader reads it as
 * selected; on the web a button is toggled, so it's `aria-pressed`, which
 * `aria-selected` on a button isn't.
 */
export const toggleState = (active: boolean, disabled = false) =>
  Platform.OS === 'web'
    ? ({ accessibilityState: { disabled }, 'aria-pressed': active } as const)
    : ({ accessibilityState: { selected: active, disabled } } as const)
