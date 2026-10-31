import { type Ref, type RefObject, useRef } from 'react'
import { ScrollView, type ScrollViewProps } from 'react-native'
import { focusedInput } from '@/lib/focusedInput'

/** Room left between the focused field and the view's bottom edge. */
const REVEAL_MARGIN = 16

type RevealHandles = {
  scroll: RefObject<ScrollView | null>
  scrollY: RefObject<number>
  /** Whether the focused field is inside this view. */
  hasFocus: RefObject<boolean>
}

/** Scrolls the focused field up just far enough to clear the view's bottom. */
const revealFocusedField = (handles: RevealHandles, animated: boolean) =>
  requestAnimationFrame(() => {
    const view = handles.scroll.current
    const frame = view?.getNativeScrollRef()
    const input = focusedInput()
    if (!handles.hasFocus.current || !view || !frame || !input) return
    frame.measureInWindow((_viewX, viewY, _viewWidth, viewHeight) => {
      input.measureInWindow((_x, y, _width, height) => {
        const covered = y + height + REVEAL_MARGIN - (viewY + viewHeight)
        if (covered > 0) {
          view.scrollTo({ y: handles.scrollY.current + covered, animated })
        }
      })
    })
  })

type Props = ScrollViewProps & { ref?: Ref<ScrollView> }

/**
 * A step's scroll view, for steps whose footer rides on the keyboard
 * (`OnboardingFooter`). The keyboard shrinks this view instead of covering it,
 * so while a field in it has focus, every resize scrolls the field back above
 * the view's new bottom edge, frame by frame as the keyboard comes up.
 */
const OnboardingScrollView = ({
  ref,
  onScroll,
  onLayout,
  onFocus,
  onBlur,
  ...props
}: Props) => {
  const scroll = useRef<ScrollView>(null)
  const scrollY = useRef(0)
  const hasFocus = useRef(false)
  const handles = { scroll, scrollY, hasFocus }

  return (
    <ScrollView
      scrollEventThrottle={16}
      {...props}
      ref={(instance: ScrollView | null) => {
        scroll.current = instance
        if (typeof ref === 'function') ref(instance)
        else if (ref) ref.current = instance
      }}
      onScroll={(event) => {
        scrollY.current = event.nativeEvent.contentOffset.y
        onScroll?.(event)
      }}
      onLayout={(event) => {
        revealFocusedField(handles, false)
        onLayout?.(event)
      }}
      // A field's focus and blur bubble up to its scroll view.
      onFocus={(event) => {
        hasFocus.current = true
        revealFocusedField(handles, true)
        onFocus?.(event)
      }}
      onBlur={(event) => {
        hasFocus.current = false
        onBlur?.(event)
      }}
    />
  )
}

export default OnboardingScrollView
