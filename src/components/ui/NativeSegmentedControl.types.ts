import type { StyleProp, ViewStyle } from 'react-native'

export interface NativeSegmentedOption<T extends string = string> {
  key: T
  label: string
  testID?: string
}

export interface NativeSegmentedControlProps<T extends string = string> {
  options: ReadonlyArray<NativeSegmentedOption<T>>

  value: T | null | undefined
  onChange: (key: T) => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}
