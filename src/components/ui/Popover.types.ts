import type { ReactElement, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

export type PopoverControls = {
  close: () => void

  closeThen: (action: () => void) => void
}

export type PopoverProps = {
  renderTrigger: (props: {
    onPress: () => void
    expanded: boolean
  }) => ReactElement

  style?: StyleProp<ViewStyle>

  contentWidth: number

  contentStyle?: StyleProp<ViewStyle>

  backgroundColor?: string

  children: ReactNode | ((controls: PopoverControls) => ReactNode)
}
