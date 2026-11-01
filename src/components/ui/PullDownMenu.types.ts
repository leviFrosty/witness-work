import type { ReactElement } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'
import type { PointerEffect } from '@/components/ui/PointerHover'

export type PullDownMenuProps = {
  actions: ContextMenuEntries

  accessibilityLabel: string
  accessibilityHint?: string

  accessibilityValue?: string

  children?: ReactElement

  triggerSize?: number

  triggerColor?: string

  pointerEffect?: PointerEffect | 'tint'

  hoverRadius?: number

  fill?: boolean

  onOpen?: () => void
  style?: StyleProp<ViewStyle>
  testID?: string
}
