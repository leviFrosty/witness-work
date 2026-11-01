import { useEffect, useRef, useState } from 'react'
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  type View,
} from 'react-native'
import type { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'

const MARGIN = 12

export default function useRevealAboveSheet() {
  const { height: windowHeight } = useWindowDimensions()
  const scrollRef = useRef<KeyboardAwareScrollView>(null)
  const targetRef = useRef<View>(null)
  const scrollY = useRef(0)
  const [sheetHeight, setSheetHeight] = useState(0)

  useEffect(() => {
    if (!sheetHeight) return

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

    onSheetHeightChange: setSheetHeight,

    bottomInset: sheetHeight,
  }
}

export type RevealAboveSheet = ReturnType<typeof useRevealAboveSheet>
