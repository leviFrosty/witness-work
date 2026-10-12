import type { PopoverProps } from '@/components/ui/Popover.types'

export type {
  PopoverControls,
  PopoverProps,
} from '@/components/ui/Popover.types'

/**
 * Content anchored to its trigger: a SwiftUI popover on iOS
 * (`Popover.ios.tsx`), a Material menu surface on Android
 * (`Popover.android.tsx`). Other platforms render the trigger alone.
 *
 * For a list of actions use `PullDownMenu` or `ContextMenu` instead, and for
 * optional details beside a label `InfoPopover`. Content that opens a Tamagui
 * `Sheet` of its own can't live in a native popover, which would cover it; see
 * `AnchoredPopover`.
 */
export default function Popover({ renderTrigger }: PopoverProps) {
  return renderTrigger({ onPress: () => {}, expanded: false })
}
