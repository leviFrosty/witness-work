import { Pressable, View } from 'react-native'
import type { ContextMenuProps } from '@/components/ui/ContextMenu.types'

export type {
  ContextMenuAction,
  ContextMenuEntries,
  ContextMenuItem,
  ContextMenuProps,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'

/**
 * Long-press menu for a piece of content: the native SwiftUI context menu on
 * iOS (`ContextMenu.ios.tsx`) and a Material dropdown menu on Android
 * (`ContextMenu.android.tsx`). Other platforms render the content without a
 * menu.
 *
 * Apple's rules for what goes in it: only the item's most relevant actions,
 * each also reachable elsewhere in the UI (a detail screen, a toolbar); hide
 * unavailable items; at most about three groups with destructive items last;
 * one level of submenus. Use it consistently for the same kind of object
 * everywhere it appears.
 */
export default function ContextMenu({
  children,
  onPress,
  accessibilityLabel,
  accessible,
  style,
}: ContextMenuProps) {
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}
        onPress={onPress}
        accessible={accessible}
        accessibilityRole='button'
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
    )
  }
  return <View style={style}>{children}</View>
}
