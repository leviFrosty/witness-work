import type { ReactNode } from 'react'
import type { SnapPoint } from '@expo/ui'

/**
 * A height a sheet can rest at: `'half'`, `'full'`, `{ fraction }` of the
 * screen, or `{ height }` in points. iOS honors each one. Android only has a
 * half and a full height, so a sheet there opens at half height when its lowest
 * point is half the screen or less, and at full height otherwise.
 */
export type SheetSnapPoint = SnapPoint

export type SheetProps = {
  open: boolean
  /**
   * Called with `false` when the User dismisses the sheet: swiping it down,
   * tapping outside it, or Android's Back. Closing it yourself (`open` turns
   * false) doesn't call it.
   */
  onOpenChange: (open: boolean) => void
  /**
   * Runs once the sheet has finished closing, however it closed. Present a
   * screen or a system sheet from here, so it doesn't land while this one is
   * still on its way out.
   */
  onClosed?: () => void
  /**
   * The heights the sheet rests at. Leave it out to size the sheet to its
   * content, which suits most sheets; put content that can outgrow the screen
   * in `Sheet.ScrollView`. With snap points the content fills the sheet, so lay
   * it out with `flex: 1`.
   */
  snapPoints?: SheetSnapPoint[]
  /**
   * Whether the User can dismiss the sheet by swiping it down, tapping outside
   * it or Android's Back. Turn it off while something mustn't be interrupted,
   * or when dragging inside the sheet (a map) shouldn't move it; the sheet then
   * needs its own close button. Defaults to true.
   */
  dismissible?: boolean
  /** The sheet's background. Defaults to the theme's sheet color. */
  backgroundColor?: string
  /**
   * What a screen reader calls the sheet, where the platform asks for one (the
   * web's dialogs). Without it the web names a sheet after its first heading or
   * line of text.
   */
  accessibilityLabel?: string
  testID?: string
  children: ReactNode
}

/** What `Sheet` asks of the platform's native sheet (`NativeSheet.*.tsx`). */
export type NativeSheetProps = {
  open: boolean
  /** The User dismissed the sheet. */
  onDismiss: () => void
  /** The sheet finished closing; it's safe to unmount. */
  onClosed: () => void
  snapPoints?: SheetSnapPoint[]
  dismissible: boolean
  backgroundColor: string
  /** The app's appearance; follows the device when unset. */
  colorScheme?: 'light' | 'dark'
  accessibilityLabel?: string
  testID?: string
  children: ReactNode
}
