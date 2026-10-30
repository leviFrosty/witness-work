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

/** Under Tamagui's modal sheets (100,000 and up), so theirs open over it. */
const Z_INDEX = 50_000
const RADIUS = 24
/** Beside an iPad's sidebar, the sheet stays a readable width, centered. */
const MAX_WIDTH = 720
const EASING = Easing.bezier(0.2, 0.9, 0.3, 1)
const OPEN_MS = 300
const CLOSE_MS = 220
const RESIZE_MS = 220
/** Pulled this far under its smallest size, the sheet closes on release. */
const DISMISS_DISTANCE = 72
/** Seconds of a release's speed that count toward how far it was pulled. */
const FLING_PROJECTION = 0.15
/** How much of a drag past the largest size still moves the sheet. */
const RUBBER_BAND = 0.2
/** VoiceOver and TalkBack resize in steps of this share of the window. */
const ACCESSIBILITY_STEP = 0.1
/** A hardware keyboard's shortcut bar, not a full keyboard. */
const KEYBOARD_BAR_MAX_HEIGHT = 120

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Slides an open sheet out of view while another screen is up, e.g. the note
   * editor, keeping its content and state for when it slides back.
   */
  hidden?: boolean
  /** Pinned under the grabber. Dragging it resizes the sheet too. */
  header?: ReactNode
  children: ReactNode
  /** Android's back button. Closes the sheet unless this is set. */
  onBackPress?: () => void
  /**
   * The height the sheet rests at while open, and 0 once it closes, so the
   * screen above can keep what the sheet is about in view.
   */
  onHeightChange?: (height: number) => void
}

/**
 * A sheet docked to the bottom of the window that leaves the screen above it
 * visible and usable, like a split view. Dragging its top edge resizes it
 * between `SPLIT_SHEET_MIN_RATIO` and `SPLIT_SHEET_MAX_RATIO` of the window,
 * and the size is kept for next time; pulling it below that closes it. It
 * stretches taller while a keyboard is up, so a field in it isn't squeezed out
 * of view.
 *
 * It renders through Tamagui's Portal, above the tab bar. Content there sits
 * outside the screen's providers, so pass on any context it needs.
 */
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
  // Beside the sidebar, clear of iPhone Duo's vertical bar, and on one side of
  // its fold, as the system's sheets are.
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
  // The height it settles at when it isn't being dragged.
  const resting = useSharedValue(targetHeight)
  // How far the sheet sits below its docked position: out of view when closed.
  const offset = useSharedValue(shown ? 0 : targetHeight + RADIUS)
  const dragStart = useSharedValue(0)
  const dragging = useSharedValue(false)
  // The host's latest callbacks, so its re-renders don't re-run the effects
  // below: each report of the height may scroll the screen above.
  const callbacks = useRef({ onOpenChange, onBackPress, onHeightChange })
  useEffect(() => {
    callbacks.current = { onOpenChange, onBackPress, onHeightChange }
  })

  const isOpen = useRef(open)

  useEffect(() => {
    isOpen.current = open
    // Read when a close animation ends: a sheet opened again meanwhile (or
    // opened as it first mounted, e.g. from a widget's link) stays, and so
    // does a hidden one.
    const unmountIfClosed = () => {
      if (!isOpen.current) setMounted(false)
    }
    if (shown) {
      setMounted(true)
      // Dragged closed, it was left at its smallest; it opens at its size.
      if (offset.value >= height.value) offset.value = resting.value + RADIUS
      height.value = resting.value
      offset.value = withTiming(0, { duration: OPEN_MS, easing: EASING })
      return
    }
    // Past the bottom edge by its corners, so its shadow goes too.
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

  // A keyboard's Escape does what Android's Back does.
  useEffect(() => {
    if (Platform.OS !== 'web' || !shown) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const { onBackPress, onOpenChange } = callbacks.current
      if (onBackPress) onBackPress()
      else onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
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
        // Below its smallest size the sheet slides down whole, toward closing.
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
      // Still dragging here means the gesture was interrupted.
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
              // As text: iOS reads min/max/now as a share of the range.
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
              {/* The iPad pointer shows which ways the sheet can resize. */}
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
