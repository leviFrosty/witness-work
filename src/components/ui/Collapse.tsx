import { PropsWithChildren, useState } from 'react'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'

export default function Collapse({
  collapsed,
  children,
}: PropsWithChildren<{ collapsed: boolean }>) {
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
      {}
      <View
        style={{ position: 'absolute', width: '100%' }}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </Animated.View>
  )
}
