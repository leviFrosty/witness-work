import type { ReactElement, ReactNode, Ref } from 'react'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'

export type GroupedListProps = {
  children: ReactNode

  title?: string

  header?: ReactNode

  banner?: ReactNode

  editing?: boolean
  testID?: string
}

export type GroupedListSectionProps = {
  children: ReactNode
  title?: string

  footer?: string
}

type RowBase = {
  label: string
  icon?: AppIcon
  testID?: string
}

export type GroupedListRowProps = RowBase & {
  sublabel?: string
  iconColor?: string
  iconFill?: string
  onPress?: () => void

  accessory?: 'chevron' | 'external' | 'none'

  trailing?: ReactElement

  url?: string

  contextActions?: ContextMenuEntries

  menuActions?: ContextMenuEntries
  menuLabel?: string

  disabled?: boolean

  selected?: boolean

  checked?: boolean

  tint?: string
}

export type GroupedListSwitchRowProps = RowBase & {
  value: boolean
  onValueChange: (value: boolean) => void

  info?: string
  disabled?: boolean
}

export type GroupedListPickerOption = { value: string; label: string }

export type GroupedListPickerRowProps = RowBase & {
  options: GroupedListPickerOption[]
  value: string
  onChange: (value: string) => void

  sublabel?: string
}

export type GroupedListReorderSectionProps<T> = {
  title?: string
  footer?: string
  data: readonly T[]
  keyExtractor: (item: T) => string

  onMove: (from: number, to: number) => void
  children: (item: T, index: number) => ReactElement
}

export type GroupedListTextFieldRowRef = { focus: () => void }

export type GroupedListTextFieldRowProps = {
  value: string
  onChangeText: (text: string) => void

  onEndEditing?: () => void
  accessibilityLabel: string
  placeholder?: string
  maxLength?: number
  autoCapitalize?: 'words' | 'sentences'
  invalid?: boolean

  sublabel?: string

  action?: { label: string; onPress: () => void }

  menuActions?: ContextMenuEntries
  menuLabel?: string
  ref?: Ref<GroupedListTextFieldRowRef>
  testID?: string
}
