import type { ReactElement } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { ButtonProps } from '@expo/ui/swift-ui'

export type ContextMenuAction = {
  id: string
  /** Localized label. Phrase toggles as the action ("Add to Favorites"). */
  title: string
  onPress: () => void
  /** Red, and listed last in its menu — pair with `confirmDestructive`. */
  destructive?: boolean
  /** SF Symbol on iOS; PullDownMenu maps supported names to Android drawables. */
  systemImage?: ButtonProps['systemImage']
}

/** One level of nested actions, e.g. Delete ▸ This plan / All plans. */
export type ContextMenuSubmenu = {
  id: string
  title: string
  systemImage?: ButtonProps['systemImage']
  actions: ContextMenuAction[]
}

export type ContextMenuItem = ContextMenuAction | ContextMenuSubmenu

type Hidden = false | null | undefined

/**
 * Menu contents. Falsy entries are dropped, so unavailable items can be left
 * out inline — Apple's guidance is to hide unavailable context menu items
 * rather than dim them. A nested array is a group; groups are separated by
 * dividers (aim for three at most, destructive last).
 */
export type ContextMenuEntries = (
  | ContextMenuItem
  | Hidden
  | (ContextMenuItem | Hidden)[]
)[]

export type ContextMenuProps = {
  actions: ContextMenuEntries
  /**
   * The long-pressable content. Keep it non-interactive and use `onPress` for
   * its tap action, so taps and long presses don't compete for the touch.
   */
  children: ReactElement
  /** Tap action for the trigger content. */
  onPress?: () => void
  /** Announced on the trigger when it has an `onPress`. */
  accessibilityLabel?: string
  /**
   * Defaults to true: the trigger is one accessibility element carrying the
   * menu as custom actions. Pass false when the content holds its own
   * accessible controls (e.g. a card of tappable days) so they stay reachable;
   * the menu then isn't exposed to screen readers, so its actions must also
   * live elsewhere (they should anyway).
   */
  accessible?: boolean
  /**
   * Turns the long press off without unmounting the native menu host, for rows
   * that flip in and out of a mode (e.g. Select mode). Taps still work.
   */
  disabled?: boolean
  /**
   * Expanded content shown above the menu on iOS. Defaults to the lifted
   * trigger. Android shows the menu anchored to the trigger instead. Rendered
   * lazily on first touch, so it may read stores and derive data freely.
   */
  preview?: ReactElement
  style?: StyleProp<ViewStyle>
}
