import { Pressable, View } from 'react-native'
import type { ContextMenuProps } from '@/components/ui/ContextMenu.types'

export type {
  ContextMenuAction,
  ContextMenuEntries,
  ContextMenuItem,
  ContextMenuProps,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'

export default function ContextMenu({
  children,
  onPress,
  accessibilityLabel,
  accessibilityState,
  accessible,
  style,
  testID,
}: ContextMenuProps) {
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}
        onPress={onPress}
        accessible={accessible}
        accessibilityRole='button'
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        testID={testID}
      >
        {children}
      </Pressable>
    )
  }
  return <View style={style}>{children}</View>
}
