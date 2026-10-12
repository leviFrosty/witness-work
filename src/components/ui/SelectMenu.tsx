import type { ReactElement } from 'react'
import PullDownMenu from '@/components/ui/PullDownMenu'

export interface SelectMenuProps {
  items: { id: string; label: string; selected: boolean }[]
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
