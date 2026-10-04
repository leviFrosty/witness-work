import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
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

/**
 * Drags run on the UI thread and write `liveWidth` directly, so the sidebar
 * resizes without a React render per frame. JS only hears about the start,
 * icon/label threshold crossings, and the release.
 */
export default function SidebarResizeHandle({
  width,
  liveWidth,
}: {
  width: number
  liveWidth: SharedValue<number>
}) {
  const theme = useTheme()
  const dragActive = useRef(false)
  const startWidth = useSharedValue(width)
  const compact = useSharedValue(width < SIDEBAR_LABEL_MIN_WIDTH)
  const dragging = useSharedValue(false)
  const hovered = useSharedValue(false)
  // 0 idle, 1 hovered (pointer or Pencil), 2 dragging.
  const emphasis = useDerivedValue(() =>
    withTiming(dragging.value ? 2 : hovered.value ? 1 : 0, { duration: 160 })
  )
  const preview = useSidebarResize((s) => s.preview)
  const setWidth = useSidebarPreferences((s) => s.setWidth)

  useEffect(
    () => () => {
      if (dragActive.current) {
        // Queued native frames must not revive a drag after unmount/refresh.
        dragActive.current = false
        dragging.value = false
        liveWidth.value = useSidebarPreferences.getState().width
        preview(null)
      }
    },
    [dragging, liveWidth, preview]
  )

  const commitWidth = (nextWidth: number) => {
    setWidth(nextWidth)
  }

  const beginDrag = () => {
    dragActive.current = true
  }
  const previewCompact = (nextCompact: boolean) => {
    if (dragActive.current) preview(nextCompact)
  }
  const endDrag = (nextWidth: number) => {
    if (!dragActive.current) return
    dragActive.current = false
    commitWidth(nextWidth)
  }
  const finalizeDrag = () => {
    dragActive.current = false
    preview(null)
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-3, 3])
    .onStart(() => {
      startWidth.value = liveWidth.value
      compact.value = liveWidth.value < SIDEBAR_LABEL_MIN_WIDTH
      dragging.value = true
      scheduleOnRN(beginDrag)
    })
    .onUpdate(({ translationX }) => {
      if (!dragging.value) return
      const nextWidth = clampSidebarWidth(startWidth.value + translationX)
      liveWidth.value = nextWidth
      const nextCompact = nextWidth < SIDEBAR_LABEL_MIN_WIDTH
      if (nextCompact !== compact.value) {
        compact.value = nextCompact
        scheduleOnRN(previewCompact, nextCompact)
      }
    })
    .onEnd(({ translationX }, success) => {
      if (!success || !dragging.value) return
      const nextWidth = clampSidebarWidth(startWidth.value + translationX)
      liveWidth.value = nextWidth
      dragging.value = false
      scheduleOnRN(endDrag, nextWidth)
    })
    .onFinalize(() => {
      // Still dragging here means the gesture was interrupted.
      if (dragging.value) {
        liveWidth.value = withTiming(startWidth.value, { duration: 220 })
        dragging.value = false
      }
      scheduleOnRN(finalizeDrag)
    })

  const hover = Gesture.Hover()
    .onBegin(() => {
      hovered.value = true
    })
    .onFinalize(() => {
      hovered.value = false
    })

  const idleColor = theme.colors.textAlt
  const activeColor = theme.colors.accent
  const thumbStyle = useAnimatedStyle(() => ({
    opacity: interpolate(emphasis.value, [0, 1, 2], [0.45, 0.8, 1]),
    backgroundColor: interpolateColor(
      emphasis.value,
      [0, 1, 2],
      [idleColor, idleColor, activeColor]
    ),
    transform: [
      {
        scaleX: interpolate(
          emphasis.value,
          [0, 1],
          [1, 1.5],
          Extrapolation.CLAMP
        ),
      },
      {
        scaleY: interpolate(
          emphasis.value,
          [0, 1],
          [1, 1.15],
          Extrapolation.CLAMP
        ),
      },
    ],
  }))

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, hover)}>
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
        <Animated.View
          pointerEvents='none'
          style={[{ width: 4, height: 36, borderRadius: 3 }, thumbStyle]}
        />
      </View>
    </GestureDetector>
  )
}
