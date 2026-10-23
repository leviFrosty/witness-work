import type { ReactElement } from 'react'
import type {
  AccessibilityRole,
  AccessibilityState,
  StyleProp,
  ViewStyle,
} from 'react-native'
import type { ButtonProps } from '@expo/ui/swift-ui'

export type ContextMenuAction = {
  id: string
  /** Localized label. Phrase toggles as the action ("Add to Favorites"). */
  title: string
  onPress: () => void
  /** Red, and listed last in its menu — pair with `confirmDestructive`. */
  destructive?: boolean
  /** SF Symbol on iOS; `androidMenuIcons` maps supported names for Android. */
  systemImage?: ButtonProps['systemImage']
  /**
   * Shows whether this is the current choice, with a checkmark, in a
   * `PullDownMenu` selection menu. Leave it unset for plain actions.
   */
  checked?: boolean
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
   * Role of a trigger without `onPress`, e.g. `header` for a section title that
   * only long-presses. One with `onPress` is always a button.
   */
  accessibilityRole?: AccessibilityRole
  /** The trigger's state, e.g. `selected` for the chosen day in a calendar. */
  accessibilityState?: AccessibilityState
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
  /**
   * IPad pointer feedback for content with `onPress`. Rows and cards keep the
   * default `tint` (no scaling into neighbours); small cells may `highlight`.
   */
  pointerEffect?: 'tint' | 'highlight' | 'lift' | 'none'
  /** Corner radius of the hover tint, to match the content's own shape. */
  hoverRadius?: number
  /**
   * The content keeps its own width (a chip) instead of filling the width its
   * container gives it (a row or card, the default). Set it for short labels:
   * feeding the measured width back loses up to a pixel to rounding on Android,
   * which cuts the label off ("Favorit…").
   */
  fitContent?: boolean
  /**
   * Already inside an `@expo/ui` `Host` (e.g. a `Collapsible`'s content):
   * render the native menu into that host rather than nesting another one,
   * whose touch handling swallows the long press on Android. The content keeps
   * its own width, as with `fitContent`, and `style` is ignored.
   */
  hosted?: boolean
  /**
   * Android: mounts the native menu host on the first long press rather than
   * with the content, for content that mounts by the hundred (the Schedule's
   * days), where those hosts are most of the screen's cost. The long press is
   * React Native's either way, and the host then sits behind the content at its
   * size, so the menu opens where it always does. Ignored with `hosted`, and on
   * iOS, whose native long press must exist before the touch lands.
   */
  deferHost?: boolean
  style?: StyleProp<ViewStyle>
  /** The trigger's test id, for e2e flows (`e2e/maestro`). */
  testID?: string
}
