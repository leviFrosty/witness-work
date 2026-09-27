import { Pressable, View } from 'react-native'
import type { ContextMenuProps } from '@/components/ui/ContextMenu.types'

export type {
  ContextMenuAction,
  ContextMenuProps,
} from '@/components/ui/ContextMenu.types'

/**
 * Long-press menu for a piece of content: the native SwiftUI context menu on
 * iOS (`ContextMenu.ios.tsx`) and a Material dropdown menu on Android
 * (`ContextMenu.android.tsx`). Other platforms render the content without a
 * menu.
 */
export default function ContextMenu({
  children,
  onPress,
  style,
}: ContextMenuProps) {
  if (onPress) {
    return (
      <Pressable style={style} onPress={onPress} accessibilityRole='button'>
        {children}
      </Pressable>
    )
  }
  return <View style={style}>{children}</View>
}
