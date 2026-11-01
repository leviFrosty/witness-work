import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { GestureDetector, type GestureType } from 'react-native-gesture-handler'
import { TooltipBubble } from '@/components/ui/PointerTooltip'
import {
  type Bounds,
  placePinLabel,
  type Rect,
} from '@/features/map/lib/pinHover'

export default function MapPinLabel({
  name,
  box,
  bounds,
}: {
  name: string

  box: Rect
  bounds: Bounds
}) {
  const [size, setSize] = useState<{ width: number; height: number }>()
  const position = size ? placePinLabel(box, size, bounds) : undefined

  return (
    <View
      pointerEvents='none'
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        direction: 'ltr',
      }}
    >
      <TooltipBubble
        label={name}
        position={position}
        onSize={setSize}
        maxWidth={240}
      />
    </View>
  )
}

export function PinHoverArea({
  gesture,
  onTouchStart,
  children,
}: {
  gesture: GestureType | undefined
  onTouchStart: () => void
  children: ReactNode
}) {
  if (!gesture)
    return <View style={{ height: '100%', width: '100%' }}>{children}</View>
  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        onTouchStart={onTouchStart}
        style={{ height: '100%', width: '100%' }}
      >
        {children}
      </View>
    </GestureDetector>
  )
}
