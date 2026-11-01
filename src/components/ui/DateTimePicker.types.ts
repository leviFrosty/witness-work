export type DateTimePickerMode = 'date' | 'time' | 'datetime'

export type DateTimePickerEvent = {
  type: 'set'
  nativeEvent: { timestamp: number; utcOffset: number }
}

export type DateTimePickerProps = {
  value: Date

  onChange: (event: DateTimePickerEvent, date?: Date | undefined) => void
  maximumDate?: Date | undefined
  minimumDate?: Date | undefined

  iOSMode?: DateTimePickerMode

  display?: 'compact' | 'inline'
  testID?: string
}

export type DateTimeDialogProps = {
  part: 'date' | 'time'
  value: Date
  maximumDate?: Date | undefined
  minimumDate?: Date | undefined
  onPick: (date: Date) => void
  onDismiss: () => void
}
