import {
  type ComponentProps,
  type Ref,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Keyboard, Platform, StyleSheet, TextInput } from 'react-native'
import { KeyboardAwareScrollView as BaseScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const REVEAL_MARGIN = 16

type Props = ComponentProps<typeof BaseScrollView> & {
  ref?: Ref<BaseScrollView>
}

export default function KeyboardAwareScrollView(props: Props) {
  return Platform.OS === 'android' ? (
    <AndroidKeyboardAwareScrollView {...props} />
  ) : (
    <BaseScrollView {...props} />
  )
}

type RevealHandles = {
  scroll: RefObject<BaseScrollView | null>
  scrollY: RefObject<number>

  keyboardTop: RefObject<number | null>
}

const revealFocusedField = (handles: RevealHandles) =>
  requestAnimationFrame(() => {
    const top = handles.keyboardTop.current
    const input = TextInput.State.currentlyFocusedInput()
    if (top === null || !input) return
    input.measureInWindow((_x, y, _width, height) => {
      const covered = y + height + REVEAL_MARGIN - top
      if (covered > 0) {
        handles.scroll.current?.scrollToPosition(
          0,
          handles.scrollY.current + covered,
          true
        )
      }
    })
  })

function AndroidKeyboardAwareScrollView({
  ref,
  onScroll,
  onFocus,
  onBlur,
  contentContainerStyle,
  ...props
}: Props) {
  const insets = useSafeAreaInsets()
  const scroll = useRef<BaseScrollView>(null)
  const scrollY = useRef(0)
  const keyboardTop = useRef<number | null>(null)

  const hasFocus = useRef(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', (event) => {
        keyboardTop.current = event.endCoordinates.screenY

        setKeyboardHeight(event.endCoordinates.height + insets.bottom)
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        keyboardTop.current = null
        setKeyboardHeight(0)
      }),
    ]
    return () => subscriptions.forEach((subscription) => subscription.remove())
  }, [insets.bottom])

  useEffect(() => {
    if (!keyboardHeight || !hasFocus.current) return
    const frame = revealFocusedField({ scroll, scrollY, keyboardTop })
    return () => cancelAnimationFrame(frame)
  }, [keyboardHeight])

  const basePaddingBottom = StyleSheet.flatten(
    contentContainerStyle
  )?.paddingBottom

  return (
    <BaseScrollView
      {...props}
      ref={(instance: BaseScrollView | null) => {
        scroll.current = instance
        if (typeof ref === 'function') ref(instance)
        else if (ref) ref.current = instance
      }}
      onScroll={(event) => {
        scrollY.current = event.nativeEvent.contentOffset.y
        onScroll?.(event)
      }}
      onFocus={(event) => {
        hasFocus.current = true
        revealFocusedField({ scroll, scrollY, keyboardTop })
        onFocus?.(event)
      }}
      onBlur={(event) => {
        hasFocus.current = false
        onBlur?.(event)
      }}
      contentContainerStyle={[
        contentContainerStyle,
        keyboardHeight > 0 && {
          paddingBottom:
            (typeof basePaddingBottom === 'number' ? basePaddingBottom : 0) +
            keyboardHeight,
        },
      ]}
    />
  )
}
