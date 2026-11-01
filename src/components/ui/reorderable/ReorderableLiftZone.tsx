import { type ReactNode, useContext } from 'react'
import { View } from 'react-native'
import { ReorderableItemContext } from '@/components/ui/reorderable/context'
import LiftDetector from '@/components/ui/reorderable/LiftDetector'

export default function ReorderableLiftZone({
  children,
}: {
  children: ReactNode
}) {
  const item = useContext(ReorderableItemContext)
  const gesture = item?.liftGesture() ?? null
  if (!gesture) return children
  return (
    <LiftDetector gesture={gesture} onUnmount={item?.liftLost}>
      <View collapsable={false}>{children}</View>
    </LiftDetector>
  )
}
