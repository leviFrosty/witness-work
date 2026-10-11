import { useEffect, useRef, useState } from 'react'
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  type View,
} from 'react-native'
import type { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'

/** Room left between the revealed view and the sheet's rounded top edge. */
const MARGIN = 12

/**
 * Scrolls a screen so a view in it sits above a sheet docked over the bottom of
 * the window (`SplitSheet`), e.g. the week a day was picked from above that
 * day's sheet. A view already above the sheet stays put.
 */
export default function useRevealAboveSheet() {
  const { height: windowHeight } = useWindowDimensions()
  const scrollRef = useRef<KeyboardAwareScrollView>(null)
  const targetRef = useRef<View>(null)
  const scrollY = useRef(0)
  const [sheetHeight, setSheetHeight] = useState(0)

  useEffect(() => {
    if (!sheetHeight) return
    // A frame later, once the room kept under the content has laid out.
    const frame = requestAnimationFrame(() =>
      targetRef.current?.measureInWindow((_x, y, _width, height) => {
        const covered = y + height + MARGIN - (windowHeight - sheetHeight)
        if (covered <= 0) return
        scrollRef.current?.scrollToPosition(0, scrollY.current + covered, true)
      })
    )
    return () => cancelAnimationFrame(frame)
  }, [sheetHeight, windowHeight])

  return {
    scrollRef,
    targetRef,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = event.nativeEvent.contentOffset.y
    },
    /** The sheet's `onHeightChange`. */
    onSheetHeightChange: setSheetHeight,
    /**
     * Room to keep under the scroll content while the sheet is open, so a
     * target near the end can still scroll above it.
     */
    bottomInset: sheetHeight,
  }
}

export type RevealAboveSheet = ReturnType<typeof useRevealAboveSheet>
