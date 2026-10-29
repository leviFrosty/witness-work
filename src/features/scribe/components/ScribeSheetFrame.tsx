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
  /** Fixed sheet height; omit to fit the content. */
  height?: number
  /**
   * The backdrop was tapped, the sheet was pulled down, or (Android) Back was
   * pressed. The screen decides whether to close.
   */
  onDismissRequest: () => void
  /**
   * Given, a pull down or a tap on the backdrop slides the sheet away and calls
   * this instead of `onDismissRequest`.
   */
  onMinimizeRequest?: () => void
  children: ReactNode
}

const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 900
const WIDE_MAX_WIDTH = 520
// Skipped under Reduce Motion (the system setting).
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

/**
 * A bottom sheet drawn over the screen it opened from (a transparent modal
 * route, or a modal over a conversation): dimmed backdrop, grabber, slides up
 * on open, follows a pull down. On wide windows it floats as a centered card
 * instead of spanning the width. At rest its transform is the identity: Android
 * can rebuild the view from its first-render props (after another app's dialog,
 * such as the speech download prompt), and a sheet that started off-screen
 * would vanish.
 */
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
  // Clear of iPhone Duo's vertical bar, and on one side of its fold.
  const pane = useWindowFoldPane()
  const wideWidth = Math.min(WIDE_MAX_WIDTH, pane.width)
  const drag = useSharedValue(0)
  // Past the window's height, wherever the sheet starts.
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
  // Clears as the sheet slides away to minimize.
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
          // VoiceOver's escape gesture (two-finger scrub) can't reach the
          // backdrop behind a modal view, so it asks to close here.
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
