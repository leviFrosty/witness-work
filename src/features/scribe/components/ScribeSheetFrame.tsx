import type { ReactNode } from 'react'
import { Pressable, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  FadeIn,
  interpolate,
  runOnJS,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { withAlpha } from '@/lib/color'
import i18n from '@/lib/locales'
import { useWindowFoldPane } from '@/components/ui/layout/FoldPane'

interface Props {
  height?: number

  onDismissRequest: () => void

  onMinimizeRequest?: () => void
  children: ReactNode
}

const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 900
const WIDE_MAX_WIDTH = 520

const SLIDE_IN = SlideInDown.duration(320)
const FADE_IN = FadeIn.duration(220)
const SLIDE_OUT_MS = 220

const Grabber = () => {
  const theme = useTheme()
  return (
    <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
      <View
        style={{
          width: 38,
          height: 5,
          borderRadius: 3,
          backgroundColor: theme.colors.border,
        }}
      />
    </View>
  )
}

const ScribeSheetFrame = ({
  height,
  onDismissRequest,
  onMinimizeRequest,
  children,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height: windowHeight, width: windowWidth } = useWindowDimensions()
  const { isWide } = useAdaptiveLayout()

  const pane = useWindowFoldPane()
  const wideWidth = Math.min(WIDE_MAX_WIDTH, pane.width)
  const drag = useSharedValue(0)

  const away = windowHeight

  const minimize = () => {
    if (!onMinimizeRequest) return
    drag.value = withTiming(away, { duration: SLIDE_OUT_MS }, (finished) => {
      if (finished) runOnJS(onMinimizeRequest)()
    })
  }
  const dismiss = onMinimizeRequest ? minimize : onDismissRequest

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      drag.value = Math.max(0, e.translationY)
    })
    .onEnd((e) => {
      const pulled =
        e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY
      if (pulled && onMinimizeRequest) {
        runOnJS(minimize)()
        return
      }
      drag.value = withSpring(0, { damping: 20, stiffness: 220 })
      if (pulled) runOnJS(onDismissRequest)()
    })

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.value }],
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: onMinimizeRequest ? interpolate(drag.value, [0, away], [1, 0]) : 1,
  }))

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        entering={onMinimizeRequest ? FADE_IN : undefined}
        style={[{ position: 'absolute', inset: 0 }, backdropStyle]}
      >
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={i18n.t(
            onMinimizeRequest ? 'scribe_voiceMinimize' : 'close'
          )}
          onPress={dismiss}
          style={{
            flex: 1,
            backgroundColor: withAlpha(theme.colors.shadow, 0x8c),
          }}
        />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          entering={SLIDE_IN}
          accessibilityViewIsModal
          onAccessibilityEscape={dismiss}
          style={[
            {
              position: 'absolute',
              bottom: isWide ? Math.max(insets.bottom, 24) : 0,
              left: isWide
                ? pane.start + (pane.width - wideWidth) / 2
                : pane.start,
              right: isWide ? undefined : windowWidth - pane.start - pane.width,
              width: isWide ? wideWidth : undefined,
              height,
              maxHeight: windowHeight - insets.top - 12,
              backgroundColor: theme.colors.sheet,
              borderTopStartRadius: 30,
              borderTopEndRadius: 30,
              borderBottomStartRadius: isWide ? 30 : 0,
              borderBottomEndRadius: isWide ? 30 : 0,
              borderCurve: 'continuous',
              overflow: 'hidden',
              paddingBottom: isWide ? 12 : insets.bottom,
            },
            sheetStyle,
          ]}
        >
          <Grabber />
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

export default ScribeSheetFrame
