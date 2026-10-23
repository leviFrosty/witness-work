import type { ReactNode } from 'react'
import Animated from 'react-native-reanimated'
import { STOW_TRANSITION } from '@/features/map/lib/mapStyles'

/**
 * Where Select mode's bar or a group's list floats, in place of the cards: a
 * full-width card on phones, beside the trailing edge on wide layouts. Reports
 * its height, so the controls and pin cards stay clear of it.
 */
export default function MapFloatingCard({
  isWide,
  width,
  bottom,
  onHeight,
  children,
}: {
  isWide: boolean
  /** Its width on wide layouts, the inspector's. */
  width: number
  bottom: number
  onHeight: (height: number) => void
  children: ReactNode
}) {
  return (
    <Animated.View
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        bottom,
        ...(isWide ? { right: 16, width } : { left: 16, right: 16 }),
        transitionProperty: 'bottom',
        ...STOW_TRANSITION,
      }}
    >
      {children}
    </Animated.View>
  )
}
