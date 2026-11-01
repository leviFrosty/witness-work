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
import FoldPane from '@/components/ui/layout/FoldPane'

const KEYBOARD_BAR_MAX_HEIGHT = 120
const REVEAL_MARGIN = 16

type DockedFormLayoutContextValue = {
  fieldFocused: (options?: {
    pinToTop?: boolean
    container?: RefObject<View | null>
  }) => void
  fieldBlurred: () => void

  revealAfterLayout: (target: RefObject<View | null>) => void
}

const DockedFormLayoutContext = createContext<DockedFormLayoutContextValue>({
  fieldFocused: () => {},
  fieldBlurred: () => {},
  revealAfterLayout: () => {},
})

export const useDockedFormLayout = () => useContext(DockedFormLayoutContext)

type LayoutState = {
  scrollY: number

  areaHeight: number

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

const scrollIntoView = (
  handles: LayoutHandles,
  y: number,
  height: number,
  pinToTop: boolean
) => {
  const viewport = visibleHeight(handles)

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

const DockedFormLayout = (props: {
  children: ReactNode
  dock: ReactNode
  contentContainerStyle?: StyleProp<ViewStyle>
}) => {
  const insets = useSafeAreaInsets()
  const keyboardOverlap = useSharedValue(0)

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

      if (Platform.OS === 'android') Keyboard.dismiss()
    }
    const onShow = (event: KeyboardEvent) => {
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

      if (Platform.OS === 'android') revealFocusedField(handles)
    }

    const subscriptions =
      Platform.OS === 'ios'
        ? [
            Keyboard.addListener('keyboardWillShow', onShow),

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

  const context: DockedFormLayoutContextValue = {
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

      setTimeout(() => flushPendingReveal(handles()), 150)
    },
  }

  return (
    <DockedFormLayoutContext.Provider value={context}>
      {}
      <FoldPane pointerEvents='auto'>
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
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <View style={props.contentContainerStyle}>{props.children}</View>
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
      </FoldPane>
    </DockedFormLayoutContext.Provider>
  )
}

export default DockedFormLayout
