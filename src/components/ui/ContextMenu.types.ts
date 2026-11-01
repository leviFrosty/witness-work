import type { ReactElement } from 'react'
import type {
  AccessibilityRole,
  AccessibilityState,
  StyleProp,
  ViewStyle,
} from 'react-native'
import type { ButtonProps } from '@expo/ui/swift-ui'

export type ContextMenuAction = {
  id: string

  title: string
  onPress: () => void

  destructive?: boolean

  systemImage?: ButtonProps['systemImage']

  checked?: boolean
}

export type ContextMenuSubmenu = {
  id: string
  title: string
  systemImage?: ButtonProps['systemImage']
  actions: ContextMenuAction[]
}

export type ContextMenuItem = ContextMenuAction | ContextMenuSubmenu

type Hidden = false | null | undefined

export type ContextMenuEntries = (
  | ContextMenuItem
  | Hidden
  | (ContextMenuItem | Hidden)[]
)[]

export type ContextMenuProps = {
  actions: ContextMenuEntries

  children: ReactElement

  onPress?: () => void

  accessibilityLabel?: string

  accessibilityRole?: AccessibilityRole

  accessibilityState?: AccessibilityState

  accessible?: boolean

  disabled?: boolean

  preview?: ReactElement

  onOpenChange?: (open: boolean) => void

  pointerEffect?: 'tint' | 'highlight' | 'lift' | 'none'

  hoverRadius?: number

  fitContent?: boolean

  hosted?: boolean

  deferHost?: boolean
  style?: StyleProp<ViewStyle>

  testID?: string
}
