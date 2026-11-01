import type { ReactElement, ReactNode } from 'react'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'

export type GroupedListProps = {
  children: ReactNode

  title?: string
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
