import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

/**
 * A tab's fixed content (its summary, its list of months or years) while its
 * cards are edited: it can't be removed or moved, so it rests, dimmed, and
 * tapping it, like any empty space, ends editing.
 */
export default function RestWhileEditing({
  editing,
  onFinishEditing,
  children,
}: {
  editing: boolean
  onFinishEditing: () => void
  children: ReactNode
}) {
  return (
    <Pressable
      disabled={!editing}
      onPress={onFinishEditing}
      accessible={false}
      style={{ opacity: editing ? 0.4 : 1 }}
    >
      <View pointerEvents={editing ? 'none' : 'auto'}>{children}</View>
    </Pressable>
  )
}
