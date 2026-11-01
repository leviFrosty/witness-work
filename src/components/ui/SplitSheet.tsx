import { ReactNode, useEffect, useId, useRef, useState } from 'react'
import {
  BackHandler,
  Keyboard,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { Portal } from 'tamagui'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import i18n from '@/lib/locales'
import {
  clampSplitSheetRatio,
  SPLIT_SHEET_KEYBOARD_RATIO,
  SPLIT_SHEET_MAX_RATIO,
  SPLIT_SHEET_MIN_RATIO,
  useSplitSheetPreferences,
} from '@/stores/splitSheet'
import PointerStyleView from '../../../modules/pointer-style'
import { useWindowFoldPane } from '@/components/ui/layout/FoldPane'

const Z_INDEX = 50_000
const RADIUS = 24

const MAX_WIDTH = 720
const EASING = Easing.bezier(0.2, 0.9, 0.3, 1)
const OPEN_MS = 300
const CLOSE_MS = 220
const RESIZE_MS = 220

const DISMISS_DISTANCE = 72

const FLING_PROJECTION = 0.15

const RUBBER_BAND = 0.2

const ACCESSIBILITY_STEP = 0.1

const KEYBOARD_BAR_MAX_HEIGHT = 120

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void

  hidden?: boolean

  header?: ReactNode
  children: ReactNode

  onBackPress?: () => void

  onHeightChange?: (height: number) => void
}

export default function SplitSheet({
  open,
  onOpenChange,
  hidden = false,
  header,
  children,
  onBackPress,
  onHeightChange,
}: Props) {
  const theme = useTheme()
  const holdId = useId()
  const shown = open && !hidden
  useTakeoverHold(`split-sheet:${holdId}`, shown)
  const { height: windowHeight } = useWindowDimensions()
  const { sidebarWidth } = useAdaptiveLayout()

  const pane = useWindowFoldPane()
  const areaStart = Math.max(sidebarWidth, pane.start)
  const areaWidth = Math.max(0, pane.start + pane.width - areaStart)
  const sheetWidth = Math.min(areaWidth, MAX_WIDTH)
  const ratio = useSplitSheetPreferences((s) => s.ratio)
  const setRatio = useSplitSheetPreferences((s) => s.setRatio)
  const minHeight = windowHeight * SPLIT_SHEET_MIN_RATIO
  const maxHeight = windowHeight * SPLIT_SHEET_MAX_RATIO
  const restingHeight = windowHeight * clampSplitSheetRatio(ratio)
  const [mounted, setMounted] = useState(open)
  const [keyboardUp, setKeyboardUp] = useState(false)
  const targetHeight = keyboardUp
    ? windowHeight * SPLIT_SHEET_KEYBOARD_RATIO
    : restingHeight

  const height = useSharedValue(targetHeight)

  const resting = useSharedValue(targetHeight)

  const offset = useSharedValue(shown ? 0 : targetHeight + RADIUS)
  const dragStart = useSharedValue(0)
  const dragging = useSharedValue(false)

  const callbacks = useRef({ onOpenChange, onBackPress, onHeightChange })
  useEffect(() => {
    callbacks.current = { onOpenChange, onBackPress, onHeightChange }
  })

  const isOpen = useRef(open)

  useEffect(() => {
    isOpen.current = open

    const unmountIfClosed = () => {
      if (!isOpen.current) setMounted(false)
    }
    if (shown) {
      setMounted(true)

      if (offset.value >= height.value) offset.value = resting.value + RADIUS
      height.value = resting.value
      offset.value = withTiming(0, { duration: OPEN_MS, easing: EASING })
      return
    }

    offset.value = withTiming(
      height.value + RADIUS,
      { duration: CLOSE_MS, easing: EASING },
      (finished) => {
        if (finished) scheduleOnRN(unmountIfClosed)
      }
    )
  }, [open, shown, height, offset, resting])

  useEffect(() => {
    resting.value = targetHeight
    if (dragging.value) return
    height.value = withTiming(targetHeight, {
      duration: RESIZE_MS,
      easing: EASING,
    })
  }, [targetHeight, dragging, height, resting])

  useEffect(() => {
    callbacks.current.onHeightChange?.(shown ? restingHeight : 0)
  }, [shown, restingHeight])

  useEffect(() => {
    if (!shown) return
    const subscriptions = [
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        (event) =>
          setKeyboardUp(event.endCoordinates.height > KEYBOARD_BAR_MAX_HEIGHT)
      ),
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        () => setKeyboardUp(false)
      ),
    ]
    return () => {
      subscriptions.forEach((subscription) => subscription.remove())
      setKeyboardUp(false)
    }
  }, [shown])

  useEffect(() => {
    if (Platform.OS !== 'android' || !shown) return
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        const { onBackPress, onOpenChange } = callbacks.current
        if (onBackPress) onBackPress()
        else onOpenChange(false)
        return true
      }
    )
    return () => subscription.remove()
  }, [shown])

  const close = () => callbacks.current.onOpenChange(false)
  const commitHeight = (next: number) => setRatio(next / windowHeight)

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onStart(() => {
      dragStart.value = height.value
      dragging.value = true
    })
    .onUpdate(({ translationY }) => {
      const next = dragStart.value - translationY
      if (next < minHeight) {
        height.value = minHeight
        offset.value = minHeight - next
        return
      }
      height.value =
        next > maxHeight ? maxHeight + (next - maxHeight) * RUBBER_BAND : next
      offset.value = 0
    })
    .onEnd(({ translationY, velocityY }) => {
      dragging.value = false
      const released = dragStart.value - translationY
      if (
        released - velocityY * FLING_PROJECTION <
        minHeight - DISMISS_DISTANCE
      ) {
        scheduleOnRN(close)
        return
      }
      const settled = Math.min(Math.max(released, minHeight), maxHeight)
      height.value = withTiming(settled, {
        duration: RESIZE_MS,
        easing: EASING,
      })
      offset.value = withTiming(0, { duration: RESIZE_MS, easing: EASING })
      scheduleOnRN(commitHeight, settled)
    })
    .onFinalize(() => {
      if (!dragging.value) return
      dragging.value = false
      height.value = withTiming(dragStart.value, { duration: RESIZE_MS })
      offset.value = withTiming(0, { duration: RESIZE_MS })
    })

  const sheetStyle = useAnimatedStyle(() => ({
    height: height.value,
    transform: [{ translateY: offset.value }],
  }))

  if (!mounted) return null

  const percent = Math.round(clampSplitSheetRatio(ratio) * 100)

  return (
    <Portal zIndex={Z_INDEX}>
      <Animated.View
        onAccessibilityEscape={close}
        pointerEvents={shown ? 'auto' : 'none'}
        accessibilityElementsHidden={!shown}
        importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
        style={[
          {
            position: 'absolute',
            left: areaStart + (areaWidth - sheetWidth) / 2,
            width: sheetWidth,
            bottom: 0,
            borderTopStartRadius: RADIUS,
            borderTopEndRadius: RADIUS,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.backgroundLighter,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.12,
            shadowRadius: 16,
            elevation: 16,
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={pan}>
          <View>
            <View
              accessible
              accessibilityRole='adjustable'
              accessibilityLabel={i18n.t('splitSheetResize')}
              accessibilityHint={i18n.t('splitSheetResizeHint')}
              accessibilityValue={{
                text: i18n.t('splitSheetSize', { percent }),
              }}
              accessibilityActions={[
                { name: 'increment' },
                { name: 'decrement' },
              ]}
              onAccessibilityAction={({ nativeEvent: { actionName } }) => {
                if (actionName !== 'increment' && actionName !== 'decrement')
                  return
                setRatio(
                  ratio +
                    (actionName === 'increment' ? 1 : -1) * ACCESSIBILITY_STEP
                )
              }}
              style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 6 }}
            >
              {}
              <PointerStyleView
                accessories={[
                  ...(percent < SPLIT_SHEET_MAX_RATIO * 100
                    ? (['up'] as const)
                    : []),
                  'down',
                ]}
                style={StyleSheet.absoluteFill}
              />
              <View
                pointerEvents='none'
                style={{
                  width: 36,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: theme.colors.textAlt,
                  opacity: 0.45,
                }}
              />
            </View>
            {header}
          </View>
        </GestureDetector>
        <View style={{ flex: 1 }}>{children}</View>
      </Animated.View>
    </Portal>
  )
}
