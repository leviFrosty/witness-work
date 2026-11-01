import { type RefObject, useRef } from 'react'
import type { View } from 'react-native'

export type ReorderScroller = {
  offset: () => number
  scrollTo: (y: number) => void
  viewport: () => { top: number; height: number }
  contentHeight: () => number
}

type Scrollable = {
  scrollToPosition?: (x: number, y: number, animated?: boolean) => void
  scrollTo?: (options: { x?: number; y?: number; animated?: boolean }) => void
}

export default function useReorderScroller(
  scrollRef: RefObject<Scrollable | null>,
  {
    obscuredBottom = 0,
  }: {
    obscuredBottom?: number
  } = {}
) {
  const frameRef = useRef<View>(null)
  const offset = useRef(0)
  const viewport = useRef({ top: 0, height: 0 })
  const content = useRef(0)

  const scroller: ReorderScroller = {
    offset: () => offset.current,
    scrollTo: (y) => {
      offset.current = y
      const view = scrollRef.current
      if (view?.scrollToPosition) view.scrollToPosition(0, y, false)
      else view?.scrollTo?.({ y, animated: false })
    },
    viewport: () => viewport.current,
    contentHeight: () => content.current,
  }

  return {
    scroller,
    frameRef,
    props: {
      onScroll: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
        offset.current = e.nativeEvent.contentOffset.y
      },
      onLayout: () =>
        frameRef.current?.measureInWindow((_x, top, _width, height) => {
          viewport.current = { top, height: height - obscuredBottom }
        }),
      onContentSizeChange: (_width: number, height: number) => {
        content.current = height
      },
    },
  }
}
