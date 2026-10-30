export type DateTimePickerMode = 'date' | 'time' | 'datetime'

/** Kept from the community picker's `onChange` so call sites read the same. */
export type DateTimePickerEvent = {
  type: 'set'
  nativeEvent: { timestamp: number; utcOffset: number }
}

export type DateTimePickerProps = {
  value: Date
  /** Gets the picked value, already merged and kept within the limits. */
  onChange: (event: DateTimePickerEvent, date?: Date | undefined) => void
  maximumDate?: Date | undefined
  minimumDate?: Date | undefined
  /** Which parts to pick. Android shows a button for each part. */
  iOSMode?: DateTimePickerMode
  /** On iOS, `inline` shows the whole calendar instead of compact pills. */
  display?: 'compact' | 'inline'
  /** The web's Enter in a date field: confirms, as the picker's Done does. */
  onSubmit?: () => void
  testID?: string
}

export type DateTimeDialogProps = {
  /** Which part the dialog picks. The other part of `value` is kept. */
  part: 'date' | 'time'
  value: Date
  maximumDate?: Date | undefined
  minimumDate?: Date | undefined
  onPick: (date: Date) => void
  onDismiss: () => void
}
