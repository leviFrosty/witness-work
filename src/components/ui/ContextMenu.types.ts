import type { ReactElement } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { ButtonProps } from '@expo/ui/swift-ui'

export type ContextMenuAction = {
  id: string
  /** Localized label. */
  title: string
  onPress: () => void
  destructive?: boolean
  disabled?: boolean
  /** SF Symbol shown beside the title on iOS. Android menus stay text-only. */
  systemImage?: ButtonProps['systemImage']
}

export type ContextMenuProps = {
  actions: ContextMenuAction[]
  /**
   * The long-pressable content. Keep it non-interactive and use `onPress` for
   * its tap action, so taps and long presses don't compete for the touch.
   */
  children: ReactElement
  /** Tap action for the trigger content. */
  onPress?: () => void
  /**
   * Expanded content shown above the menu on iOS. Defaults to the lifted
   * trigger. Android shows the menu anchored to the trigger instead.
   */
  preview?: ReactElement
  style?: StyleProp<ViewStyle>
}
