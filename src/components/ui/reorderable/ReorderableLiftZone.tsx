import { type ReactNode, useContext } from 'react'
import { View } from 'react-native'
import { ReorderableItemContext } from '@/components/ui/reorderable/context'
import LiftDetector from '@/components/ui/reorderable/LiftDetector'

/**
 * The part of a `ReorderableItem` with `liftOutsideEditing='zone'` that a hold
 * lifts it from outside edit mode, for items whose other parts have long
 * presses of their own (a list of days, each with its menu). While editing, the
 * whole item lifts.
 */
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
