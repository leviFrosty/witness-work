import type { ReactNode } from 'react'
import Animated from 'react-native-reanimated'
import { STOW_TRANSITION } from '@/features/map/lib/mapStyles'

export default function MapFloatingCard({
  isWide,
  width,
  bottom,
  onHeight,
  children,
}: {
  isWide: boolean

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
