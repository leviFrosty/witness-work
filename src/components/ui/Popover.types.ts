import type { ReactElement, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

export type PopoverControls = {
  close: () => void
  /**
   * Closes the popover, then runs `action` once it's fully gone. Use it for
   * anything that presents (navigation, a share sheet, a paywall): opened while
   * the popover is still up, it would land on the popover and be dismissed
   * along with it.
   */
  closeThen: (action: () => void) => void
}

export type PopoverProps = {
  /**
   * The press target. Call `onPress` to open the popover; it anchors to this
   * element.
   */
  renderTrigger: (props: {
    onPress: () => void
    expanded: boolean
  }) => ReactElement
  /**
   * Style of the native view hosting the trigger. A trigger whose badge pokes
   * out of it pads itself and cancels the padding with a negative margin here,
   * since the host clips to its bounds.
   */
  style?: StyleProp<ViewStyle>
  /** Width of the content. */
  contentWidth: number
  /** Padding, gap, etc. of the content. Defaults to 12pt padding. */
  contentStyle?: StyleProp<ViewStyle>
  /**
   * Fills the popover behind the content. Defaults to the system popover
   * background on iOS and the card color on Android.
   */
  backgroundColor?: string
  /**
   * The content. Rendered only while the popover is open, so it may read stores
   * and run effects freely. The function form receives the controls.
   */
  children: ReactNode | ((controls: PopoverControls) => ReactNode)
}
