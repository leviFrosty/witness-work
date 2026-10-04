import { PropsWithChildren, useState } from 'react'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'

/**
 * Animates its children closed (height and fade) and back open. Spacing that
 * should collapse too belongs inside the children, so it's measured with them.
 */
export default function Collapse({
  collapsed,
  children,
}: PropsWithChildren<{ collapsed: boolean }>) {
  // Natural height of the children; open stays `auto` until it's measured.
  const [height, setHeight] = useState<number>()

  return (
    <Animated.View
      pointerEvents={collapsed ? 'none' : 'auto'}
      accessibilityElementsHidden={collapsed}
      importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
      style={{
        overflow: 'hidden',
        height: collapsed ? 0 : height,
        opacity: collapsed ? 0 : 1,
        transitionProperty: ['height', 'opacity'],
        transitionDuration: 260,
        transitionTimingFunction: 'ease-in-out',
      }}
    >
      {/* Measure outside normal flow so the animated height cannot squash the
      children and overwrite their natural height while collapsed. */}
      <View
        style={{ position: 'absolute', width: '100%' }}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </Animated.View>
  )
}
