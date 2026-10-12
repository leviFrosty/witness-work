import type {
  DateTimeDialogProps,
  DateTimePickerProps,
} from '@/components/ui/DateTimePicker.types'

export type {
  DateTimeDialogProps,
  DateTimePickerEvent,
  DateTimePickerProps,
} from '@/components/ui/DateTimePicker.types'

/**
 * Picks a date, a time, or both, in the app's Language, Format Region and Time
 * Format, kept within `minimumDate` and `maximumDate`. SwiftUI's `DatePicker`
 * on iOS (`DateTimePicker.ios.tsx`); on Android (`DateTimePicker.android.tsx`)
 * a button per part opening Material's dialog. Other platforms render nothing.
 */
export default function DateTimePicker(_props: DateTimePickerProps) {
  return null
}

/**
 * Android's date or time dialog on its own, for controls that show the value
 * themselves (`WhenDock`'s Date pill). Unmount it on `onPick` or `onDismiss`.
 * iOS pickers sit inline, so this renders nothing there.
 */
export function DateTimeDialog(_props: DateTimeDialogProps) {
  return null
}
