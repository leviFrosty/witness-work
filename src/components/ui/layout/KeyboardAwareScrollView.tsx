import {
  type ComponentProps,
  type Ref,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Keyboard, Platform, StyleSheet } from 'react-native'
import { KeyboardAwareScrollView as BaseScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { focusedInput } from '@/lib/focusedInput'

/** Room left between the focused field and the keyboard's top edge. */
const REVEAL_MARGIN = 16

type Props = ComponentProps<typeof BaseScrollView> & {
  ref?: Ref<BaseScrollView>
}

/**
 * `react-native-keyboard-aware-scroll-view` that also keeps the focused field
 * above the keyboard on Android. iOS already does (pass
 * `automaticallyAdjustKeyboardInsets`), so it gets the library's view as is.
 */
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
  /** The keyboard's top edge in window coordinates; null while it's down. */
  keyboardTop: RefObject<number | null>
}

/** Scrolls the focused field up just far enough to clear the keyboard. */
const revealFocusedField = (handles: RevealHandles) =>
  requestAnimationFrame(() => {
    const top = handles.keyboardTop.current
    const input = focusedInput()
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

/**
 * Android draws edge to edge, so the keyboard covers the window instead of
 * resizing it, and nothing scrolls a field it covers into view: not a field
 * tapped low on the screen, nor one the keyboard's Next key moves focus to.
 * While the keyboard is up this keeps room for it under the content and scrolls
 * the focused field above it, on the keyboard's arrival and on every focus
 * change inside this view.
 */
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
  /** Whether the focused field is inside this view, not another screen's. */
  const hasFocus = useRef(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    const subscriptions = [
      // Android only reports the keyboard once it's fully up.
      Keyboard.addListener('keyboardDidShow', (event) => {
        keyboardTop.current = event.endCoordinates.screenY
        // Its height leaves out the navigation bar it covers too.
        setKeyboardHeight(event.endCoordinates.height + insets.bottom)
      }),
      Keyboard.addListener('keyboardDidHide', () => {
        keyboardTop.current = null
        setKeyboardHeight(0)
      }),
    ]
    return () => subscriptions.forEach((subscription) => subscription.remove())
  }, [insets.bottom])

  // Once the room under the content has laid out, so a field near the end can
  // scroll that far.
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
      // A field's focus and blur bubble up to its scroll view.
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
