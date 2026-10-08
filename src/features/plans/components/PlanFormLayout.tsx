import {
  createContext,
  ReactNode,
  RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  Dimensions,
  Keyboard,
  KeyboardEvent,
  Platform,
  ScrollView,
  StyleProp,
  TextInput,
  View,
  ViewStyle,
} from 'react-native'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * A keyboard at most this tall is a hardware keyboard's shortcut bar (or an
 * iPad's), not a full keyboard. The dock rides above it instead of hiding.
 */
const KEYBOARD_BAR_MAX_HEIGHT = 120
const REVEAL_MARGIN = 16

type PlanFormLayoutContextValue = {
  /**
   * A field took focus. `pinToTop` keeps room under it, e.g. for suggestions;
   * `container` reveals the whole row around it instead of just the field.
   */
  fieldFocused: (options?: {
    pinToTop?: boolean
    container?: RefObject<View | null>
  }) => void
  fieldBlurred: () => void
  /** Scrolls `target` into view once the content it just added has laid out. */
  revealAfterLayout: (target: RefObject<View | null>) => void
}

const PlanFormLayoutContext = createContext<PlanFormLayoutContextValue>({
  fieldFocused: () => {},
  fieldBlurred: () => {},
  revealAfterLayout: () => {},
})

export const usePlanFormLayout = () => useContext(PlanFormLayoutContext)

type LayoutState = {
  scrollY: number
  /** The scroll area's height before any space is kept under it. */
  areaHeight: number
  /** How much of the form the keyboard covers once it's up; 0 when down. */
  keyboardOverlap: number
  pinFocusedToTop: boolean
  revealContainer: RefObject<View | null> | null
  pendingReveal: RefObject<View | null> | null
}

type LayoutHandles = {
  state: RefObject<LayoutState>
  scroll: RefObject<ScrollView | null>
  content: RefObject<View | null>
  dockHeight: SharedValue<number>
  barMode: SharedValue<boolean>
}

/**
 * Space kept under the scroll view. A hardware keyboard's bar lifts the dock,
 * so it's both. A full keyboard hides the dock, so it settles at the keyboard
 * (`target` is its final overlap): growing from the dock when the keyboard is
 * taller, or easing down to it when the dock is taller, so no empty band is
 * left above the keyboard.
 */
const bottomSpace = (
  keyboard: number,
  dock: number,
  bar: boolean,
  target: number
) => {
  'worklet'
  if (bar) return dock + keyboard
  if (target > 0 && target < dock) {
    return dock + (target - dock) * Math.min(keyboard / target, 1)
  }
  return Math.max(dock, keyboard)
}

const visibleHeight = (handles: LayoutHandles) => {
  const { areaHeight, keyboardOverlap } = handles.state.current
  return (
    areaHeight -
    bottomSpace(
      keyboardOverlap,
      handles.dockHeight.value,
      keyboardOverlap > 0 && handles.barMode.value,
      keyboardOverlap
    )
  )
}

/** Scrolls so content at `y`…`y + height` sits inside the visible area. */
const scrollIntoView = (
  handles: LayoutHandles,
  y: number,
  height: number,
  pinToTop: boolean
) => {
  const viewport = visibleHeight(handles)
  // A field taller than the visible area (a long note) is left to the native
  // scroll-to-caret; chasing its edges would yank the caret out of view.
  if (!pinToTop && height + REVEAL_MARGIN * 2 > viewport) return
  const top = handles.state.current.scrollY
  let target = top
  if (pinToTop) {
    target = y - REVEAL_MARGIN
  } else if (y + height + REVEAL_MARGIN > top + viewport) {
    target = y + height + REVEAL_MARGIN - viewport
  } else if (y - REVEAL_MARGIN < top) {
    target = y - REVEAL_MARGIN
  }
  target = Math.max(target, 0)
  if (Math.abs(target - top) > 1) {
    handles.scroll.current?.scrollTo({ y: target, animated: true })
  }
}

const revealFocusedField = (handles: LayoutHandles) => {
  requestAnimationFrame(() => {
    const input = TextInput.State.currentlyFocusedInput()
    const content = handles.content.current
    if (!input || !content || !handles.state.current.keyboardOverlap) return
    const target = handles.state.current.revealContainer?.current ?? input
    target.measureLayout(
      content,
      (_x, y, _width, height) =>
        scrollIntoView(
          handles,
          y,
          height,
          handles.state.current.pinFocusedToTop
        ),
      () => {}
    )
  })
}

const flushPendingReveal = (handles: LayoutHandles) => {
  const target = handles.state.current.pendingReveal?.current
  const content = handles.content.current
  handles.state.current.pendingReveal = null
  if (!target || !content) return
  target.measureLayout(
    content,
    (_x, y, _width, height) => scrollIntoView(handles, y, height, false),
    () => {}
  )
}

/**
 * The Plan form's frame: scrolling details above a dock pinned to the bottom.
 *
 * Keyboard avoidance is done by hand, like the Notes Import composer: the
 * scroll view ends exactly at the keyboard's top edge, and the focused field is
 * scrolled into view by measuring it against the scroll content itself.
 * Measuring in the scroll view's own coordinates keeps it right inside a sheet,
 * where window-based math lands fields behind the keyboard. A full keyboard
 * covers the dock, so the dock fades out and stops taking touches; a hardware
 * keyboard's short bar lifts the dock instead.
 */
const PlanFormLayout = (props: {
  children: ReactNode
  dock: ReactNode
  contentContainerStyle?: StyleProp<ViewStyle>
}) => {
  const insets = useSafeAreaInsets()
  const keyboardOverlap = useSharedValue(0)
  // The overlap the keyboard is settling at; kept through its hide animation.
  const targetOverlap = useSharedValue(0)
  const dockHeight = useSharedValue(0)
  const barMode = useSharedValue(false)
  const [dockCovered, setDockCovered] = useState(false)

  const scroll = useRef<ScrollView>(null)
  const content = useRef<View>(null)
  const state = useRef<LayoutState>({
    scrollY: 0,
    areaHeight: 0,
    keyboardOverlap: 0,
    pinFocusedToTop: false,
    revealContainer: null,
    pendingReveal: null,
  })

  // Driven by React Native's keyboard events rather than the animated
  // keyboard frame: on Android that frame goes stale when a native menu takes
  // focus while the keyboard is up, leaving the form stuck in keyboard layout.
  useEffect(() => {
    const handles = { state, scroll, content, dockHeight, barMode }
    const animateTo = (overlap: number, duration?: number) => {
      keyboardOverlap.value = withTiming(overlap, {
        duration: duration || 250,
        easing: Easing.bezier(0.17, 0.59, 0.4, 0.77),
      })
    }
    const onHide = (event?: KeyboardEvent) => {
      state.current.keyboardOverlap = 0
      state.current.revealContainer = null
      setDockCovered(false)
      animateTo(0, event?.duration)
      // Android's back button hides the keyboard but leaves the field
      // focused, so a later tap elsewhere would bring the keyboard back.
      if (Platform.OS === 'android') Keyboard.dismiss()
    }
    const onShow = (event: KeyboardEvent) => {
      // The form reaches the bottom of the screen (a phone sheet, or Android
      // edge to edge). iOS measures from the keyboard's top edge, which also
      // ignores a hardware keyboard's off-screen frame; Android's height
      // leaves out the navigation bar the keyboard covers too.
      const overlap =
        Platform.OS === 'ios'
          ? Dimensions.get('window').height - event.endCoordinates.screenY
          : event.endCoordinates.height + insets.bottom
      if (overlap <= 0) return onHide(event)
      const bar = overlap <= KEYBOARD_BAR_MAX_HEIGHT
      barMode.value = bar
      targetOverlap.value = overlap
      state.current.keyboardOverlap = overlap
      setDockCovered(!bar)
      animateTo(overlap, event.duration)
      // Android only reports the keyboard once it's fully up.
      if (Platform.OS === 'android') revealFocusedField(handles)
    }

    const subscriptions =
      Platform.OS === 'ios'
        ? [
            Keyboard.addListener('keyboardWillShow', onShow),
            // QuickType and the hardware-keyboard bar change size in place.
            Keyboard.addListener('keyboardWillChangeFrame', (event) => {
              if (state.current.keyboardOverlap) onShow(event)
            }),
            Keyboard.addListener('keyboardDidShow', () =>
              revealFocusedField(handles)
            ),
            Keyboard.addListener('keyboardWillHide', onHide),
          ]
        : [
            Keyboard.addListener('keyboardDidShow', onShow),
            Keyboard.addListener('keyboardDidHide', onHide),
          ]
    return () => subscriptions.forEach((subscription) => subscription.remove())
  }, [barMode, dockHeight, insets.bottom, keyboardOverlap, targetOverlap])

  const areaStyle = useAnimatedStyle(() => ({
    paddingBottom: bottomSpace(
      keyboardOverlap.value,
      dockHeight.value,
      barMode.value,
      targetOverlap.value
    ),
  }))

  const dockStyle = useAnimatedStyle(() => {
    const overlap = keyboardOverlap.value
    if (barMode.value) {
      return { opacity: 1, transform: [{ translateY: -overlap }] }
    }
    return {
      opacity: interpolate(overlap, [0, 80], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: 0 }],
    }
  })

  const handles = () => ({ state, scroll, content, dockHeight, barMode })

  const context: PlanFormLayoutContextValue = {
    fieldFocused: (options) => {
      state.current.pinFocusedToTop = !!options?.pinToTop
      state.current.revealContainer = options?.container ?? null
      if (state.current.keyboardOverlap) revealFocusedField(handles())
    },
    fieldBlurred: () => {
      state.current.pinFocusedToTop = false
      state.current.revealContainer = null
    },
    revealAfterLayout: (target) => {
      state.current.pendingReveal = target
      // Content that doesn't change the scroll height never reports a size
      // change, so don't wait on one forever.
      setTimeout(() => flushPendingReveal(handles()), 150)
    },
  }

  return (
    <PlanFormLayoutContext.Provider value={context}>
      <View style={{ flex: 1 }}>
        <Animated.View
          style={[{ flex: 1 }, areaStyle]}
          onLayout={(event) => {
            state.current.areaHeight = event.nativeEvent.layout.height
          }}
        >
          <ScrollView
            ref={scroll}
            innerViewRef={content as RefObject<View>}
            keyboardShouldPersistTaps='handled'
            keyboardDismissMode={
              Platform.OS === 'ios' ? 'interactive' : 'on-drag'
            }
            scrollEventThrottle={16}
            onScroll={(event) => {
              state.current.scrollY = event.nativeEvent.contentOffset.y
            }}
            onContentSizeChange={() => {
              if (state.current.pendingReveal) flushPendingReveal(handles())
              else if (state.current.keyboardOverlap)
                revealFocusedField(handles())
            }}
            contentContainerStyle={props.contentContainerStyle}
          >
            {props.children}
          </ScrollView>
        </Animated.View>
        <Animated.View
          pointerEvents={dockCovered ? 'none' : 'box-none'}
          accessibilityElementsHidden={dockCovered}
          importantForAccessibility={
            dockCovered ? 'no-hide-descendants' : 'auto'
          }
          onLayout={(event) => {
            dockHeight.value = event.nativeEvent.layout.height
          }}
          style={[
            { position: 'absolute', left: 0, right: 0, bottom: 0 },
            dockStyle,
          ]}
        >
          {props.dock}
        </Animated.View>
      </View>
    </PlanFormLayoutContext.Provider>
  )
}

export default PlanFormLayout
