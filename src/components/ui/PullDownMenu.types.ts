import type { ReactElement } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'
import type { PointerEffect } from '@/components/ui/PointerHover'

export type PullDownMenuProps = {
  /**
   * Same entries as `ContextMenu`: falsy items hidden, arrays are groups. Give
   * actions `checked` to make a selection menu.
   */
  actions: ContextMenuEntries
  /** Announced on the trigger. */
  accessibilityLabel: string
  accessibilityHint?: string
  /** The trigger's current value, e.g. a selection menu's choice. */
  accessibilityValue?: string
  /**
   * Custom trigger, kept non-interactive: the whole trigger opens the menu.
   * Defaults to a plain ellipsis "More" button.
   */
  children?: ReactElement
  /** Default trigger's icon size. */
  triggerSize?: number
  /** Default trigger's icon color. Defaults to `theme.colors.textAlt`. */
  triggerColor?: string
  /**
   * IPad pointer feedback on the trigger: `lift` suits opaque buttons, `tint`
   * fields and rows (Android mice tint it too).
   */
  pointerEffect?: PointerEffect | 'tint'
  /** Corner radius of the trigger, which shapes its pointer effect or tint. */
  hoverRadius?: number
  /**
   * The trigger fills the width its container gives it (a form field, a day
   * cell) or shrinks with it, instead of keeping its own width.
   */
  fill?: boolean
  /** Runs as the menu opens, e.g. to commit an edit and drop the keyboard. */
  onOpen?: () => void
  style?: StyleProp<ViewStyle>
  testID?: string
}
