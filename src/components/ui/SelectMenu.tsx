import type { ReactElement } from 'react'
import PullDownMenu from '@/components/ui/PullDownMenu'
import type { ContextMenuAction } from '@/components/ui/ContextMenu.types'

export type SelectMenuItem = {
  id: string
  label: string
  selected: boolean
  /**
   * An SF Symbol beside the option; Android shows it where `androidMenuIcons`
   * maps it.
   */
  systemImage?: ContextMenuAction['systemImage']
}

export interface SelectMenuProps {
  items: SelectMenuItem[]
  onSelect: (id: string) => void
  accessibilityLabel?: string
  accessibilityValue: string
  /** Corner radius of the trigger, for its iPad hover tint. */
  hoverRadius?: number
  children: ReactElement
}

/** A form control's native single-choice menu, checking the current choice. */
export default function SelectMenu({
  items,
  onSelect,
  accessibilityLabel,
  accessibilityValue,
  hoverRadius,
  children,
}: SelectMenuProps) {
  return (
    <PullDownMenu
      fill
      actions={items.map((item) => ({
        id: item.id,
        title: item.label,
        checked: item.selected,
        systemImage: item.systemImage,
        onPress: () => onSelect(item.id),
      }))}
      accessibilityLabel={accessibilityLabel ?? accessibilityValue}
      accessibilityValue={accessibilityValue}
      pointerEffect='tint'
      hoverRadius={hoverRadius}
    >
      {children}
    </PullDownMenu>
  )
}
