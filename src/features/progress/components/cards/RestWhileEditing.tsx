import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { transparentToScreenReaders } from '@/lib/screenReader'

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
      {...transparentToScreenReaders}
      style={{ opacity: editing ? 0.4 : 1 }}
    >
      <View pointerEvents={editing ? 'none' : 'auto'}>{children}</View>
    </Pressable>
  )
}
