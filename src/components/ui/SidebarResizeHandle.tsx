import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import useTheme from '@/contexts/theme'

import i18n from '@/lib/locales'
import {
  clampSidebarWidth,
  SIDEBAR_LABEL_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_RESIZE_STEP,
} from '@/lib/sidebarLayout'
import { useSidebarPreferences, useSidebarResize } from '@/stores/sidebar'

export default function SidebarResizeHandle({ width }: { width: number }) {
  const theme = useTheme()
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startWidth: number } | null>(null)
  const preview = useSidebarResize((s) => s.preview)
  const setWidth = useSidebarPreferences((s) => s.setWidth)

  useEffect(
    () => () => {
      if (drag.current) {
        // Queued native frames must not revive a drag after unmount/refresh.
        drag.current = null
        preview(null)
      }
    },
    [preview]
  )

  const commitWidth = (nextWidth: number) => {
    setWidth(nextWidth)
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-3, 3])
    .runOnJS(true)
    .onStart(() => {
      drag.current = { startWidth: width }
      setDragging(true)
    })
    .onUpdate(({ translationX }) => {
      if (!drag.current) return
      const nextWidth = clampSidebarWidth(
        drag.current.startWidth + translationX
      )
      preview(nextWidth)
    })
    .onEnd(({ translationX }, success) => {
      if (success && drag.current) {
        commitWidth(clampSidebarWidth(drag.current.startWidth + translationX))
        drag.current = null
      }
    })
    .onFinalize(() => {
      drag.current = null
      preview(null)
      setDragging(false)
    })

  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole='adjustable'
        accessibilityLabel={i18n.t('sidebarResize')}
        accessibilityHint={i18n.t('sidebarResizeHint')}
        accessibilityValue={{
          min: SIDEBAR_MIN_WIDTH,
          max: SIDEBAR_MAX_WIDTH,
          now: width,
          text: i18n.t(
            width < SIDEBAR_LABEL_MIN_WIDTH ? 'sidebarIcons' : 'sidebarLabels'
          ),
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent: { actionName } }) => {
          if (actionName !== 'increment' && actionName !== 'decrement') return
          const nextWidth = clampSidebarWidth(
            width + (actionName === 'increment' ? 1 : -1) * SIDEBAR_RESIZE_STEP
          )
          if (nextWidth !== width) commitWidth(nextWidth)
        }}
        style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: [{ translateY: -32 }],
          width: 44,
          height: 64,
          paddingRight: 10,
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <View
          pointerEvents='none'
          style={{
            width: dragging ? 5 : 4,
            height: 36,
            borderRadius: 3,
            backgroundColor: dragging
              ? theme.colors.accent
              : theme.colors.textAlt,
            opacity: dragging ? 1 : 0.45,
          }}
        />
      </View>
    </GestureDetector>
  )
}
