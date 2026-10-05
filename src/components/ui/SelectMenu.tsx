import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'

export interface SelectMenuProps {
  items: { id: string; label: string; selected: boolean }[]
  onSelect: (id: string) => void
  accessibilityLabel?: string
  accessibilityValue: string
  /** Corner radius of the trigger, for its iPad hover tint. */
  hoverRadius?: number
  children: ReactNode
}

export default function SelectMenu({
  items,
  onSelect,
  accessibilityLabel,
  accessibilityValue,
  hoverRadius,
  children,
}: SelectMenuProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <MenuView
      actions={items.map((item) => ({
        id: item.id,
        title: item.label,
        state: item.selected ? 'on' : 'off',
      }))}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
    >
      <PointerHover onHoverChange={setHovered}>
        <View
          accessible
          accessibilityRole='button'
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ text: accessibilityValue }}
        >
          {children}
          <HoverTint visible={hovered} borderRadius={hoverRadius} />
        </View>
      </PointerHover>
    </MenuView>
  )
}
