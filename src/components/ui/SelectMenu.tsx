import type { ReactNode } from 'react'
import { View } from 'react-native'
import { MenuView } from '@react-native-menu/menu'

export interface SelectMenuProps {
  items: { id: string; label: string; selected: boolean }[]
  onSelect: (id: string) => void
  accessibilityLabel?: string
  accessibilityValue: string
  children: ReactNode
}

export default function SelectMenu({
  items,
  onSelect,
  accessibilityLabel,
  accessibilityValue,
  children,
}: SelectMenuProps) {
  return (
    <MenuView
      actions={items.map((item) => ({
        id: item.id,
        title: item.label,
        state: item.selected ? 'on' : 'off',
      }))}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
    >
      <View
        accessible
        accessibilityRole='button'
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: accessibilityValue }}
      >
        {children}
      </View>
    </MenuView>
  )
}
