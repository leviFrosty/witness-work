import type { ReactElement, ReactNode } from 'react'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'

export type GroupedListProps = {
  /** `GroupedListSection`s, or components that render them. */
  children: ReactNode
  /** Large title that scrolls with the sections, e.g. "Settings". */
  title?: string
  testID?: string
}

export type GroupedListSectionProps = {
  /** Rows: `GroupedListRow`, `GroupedListSwitchRow`, `GroupedListPickerRow`. */
  children: ReactNode
  title?: string
  /** A short note under the group about all of its rows. */
  footer?: string
}

type RowBase = {
  label: string
  icon?: AppIcon
  testID?: string
}

export type GroupedListRowProps = RowBase & {
  /** Secondary line under the label, e.g. why the row is disabled. */
  sublabel?: string
  iconColor?: string
  iconFill?: string
  onPress?: () => void
  /**
   * The affordance at the end of the row: `chevron` for another screen (the
   * default when the row has `onPress`), `external` for a website, or `none`.
   */
  accessory?: 'chevron' | 'external' | 'none'
  /** React Native content before the accessory, e.g. a status dot or spinner. */
  trailing?: ReactElement
  /** Website the row opens. Long press offers Open, Copy Link and Share…. */
  url?: string
  /** Extra long-press actions, listed after the link actions. */
  contextActions?: ContextMenuEntries
  /** Dims the row and blocks the press. */
  disabled?: boolean
  /** Highlights the row whose destination is open beside the list. */
  selected?: boolean
  /**
   * One of a list of choices, chosen or not: screen readers hear which one is,
   * as the row's own check mark shows it. It doesn't highlight the row.
   */
  checked?: boolean
  /** Fills the row with a color, e.g. to set a status apart. */
  tint?: string
}

export type GroupedListSwitchRowProps = RowBase & {
  value: boolean
  onValueChange: (value: boolean) => void
  /** Optional help in an `InfoPopover` beside the label. */
  info?: string
  disabled?: boolean
}

export type GroupedListPickerOption = { value: string; label: string }

export type GroupedListPickerRowProps = RowBase & {
  options: GroupedListPickerOption[]
  value: string
  onChange: (value: string) => void
  /** Secondary line under the label. */
  sublabel?: string
}
