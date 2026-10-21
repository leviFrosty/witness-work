import { useEffect, useRef, useState } from 'react'
import {
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useHideTabBar from '@/hooks/useHideTabBar'
import useScreenReaderEnabled from '@/hooks/useScreenReaderEnabled'
import useTabReselect from '@/hooks/useTabReselect'
import {
  createBarsScrollTracker,
  fitsWithoutScrolling,
  trackBarsScroll,
} from '@/lib/hideBarsOnScroll'

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>

/** Spread onto the scroll view whose scrolling hides the bars. */
export type HideBarsScrollProps = {
  onScroll: (e: ScrollEvent) => void
  scrollEventThrottle: number
  onScrollBeginDrag: (e: ScrollEvent) => void
  onScrollEndDrag: () => void
  onMomentumScrollBegin: () => void
  onMomentumScrollEnd: () => void
  onScrollToTop: () => void
  onContentSizeChange: (width: number, height: number) => void
  onLayout: (e: LayoutChangeEvent) => void
}

/**
 * Tucks a root screen's header (see `ScrollAwayHeader`) and the floating tab
 * bar away while the user scrolls down through its content, and brings them
 * back on a scroll up, at the top, on a status-bar tap, or on a tap of the tab
 * it's already on. Only the user's own scrolling counts, not the screen jumping
 * to a row by itself.
 *
 * Phone-width layouts only: wide layouts and the sidebar keep their chrome. So
 * does a screen reader, so focus never lands on a bar that has gone. Each visit
 * to the screen starts with the bars showing. A window that widens and narrows
 * again (opening and closing iPhone Duo) leaves them as they were, so the
 * content doesn't shift under the reader.
 */
export default function useHideBarsOnScroll({
  enabled = true,
  paused = false,
  resetKey,
}: {
  /** Off brings the bars back and keeps them, e.g. for Select mode's bar. */
  enabled?: boolean
  /**
   * Holds the bars as they are, e.g. while a day's sheet that measured the
   * layout around them is open.
   */
  paused?: boolean
  /** Brings the bars back when it changes, e.g. as new content opens at its top. */
  resetKey?: string
} = {}) {
  const { isWide, hasSidebar } = useAdaptiveLayout()
  const { fontScale } = useWindowDimensions()
  const screenReader = useScreenReaderEnabled()
  const isFocused = useIsFocused()
  // Off only while the window is wide: picks up again where it was.
  const available = enabled && isFocused && !screenReader
  const active = available && !isWide && !hasSidebar
  const [scrolledAway, setScrolledAway] = useState(false)
  const [shownKey, setShownKey] = useState(resetKey)
  if (shownKey !== resetKey) {
    setShownKey(resetKey)
    setScrolledAway(false)
  } else if (!available && scrolledAway) setScrolledAway(false)
  const hidden = active && scrolledAway
  useHideTabBar(hidden)

  const scroll = useRef({
    userDriven: false,
    tracker: createBarsScrollTracker(fontScale),
    // Latest sizes from layout and content events, for `revealIfFits`.
    contentHeight: 0,
    viewportHeight: 0,
  })

  // A drag cut short (a focus change, a competing gesture) never reports its
  // end; later scrolls the screen makes by itself mustn't count as the user's.
  useEffect(() => {
    scroll.current.userDriven = false
  }, [active, paused])

  const reveal = () => {
    const { tracker } = scroll.current
    tracker.anchorY = tracker.lastY
    scroll.current.userDriven = false
    setScrolledAway(false)
  }

  // A tap on the tab already showing heads back up (see `useTabReselect`), so
  // the bars come back with it rather than once the scroll reaches the top.
  useTabReselect(() => {
    if (scrolledAway && !paused) reveal()
  })

  // Content that shrinks to fit (a filter, a shorter tab) or a viewport that
  // grows past it can't be scrolled to bring the bars back, so they come back
  // by themselves.
  const revealIfFits = () => {
    const { contentHeight, viewportHeight } = scroll.current
    if (scrolledAway && fitsWithoutScrolling(contentHeight, viewportHeight))
      reveal()
  }

  const onScroll = (e: ScrollEvent) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
    const frame = {
      y: contentOffset.y,
      contentHeight: contentSize.height,
      viewportHeight: layoutMeasurement.height,
    }
    const { tracker, userDriven } = scroll.current
    // Scrolling back to the top while wide shows them (not the screen keeping
    // its place as the window changes).
    if (!active) {
      if (userDriven && frame.y < 1 && scrolledAway) setScrolledAway(false)
      return
    }
    if (!userDriven || paused) {
      tracker.lastY = frame.y
      tracker.anchorY = frame.y
      tracker.contentHeight = frame.contentHeight
      tracker.viewportHeight = frame.viewportHeight
      // A jump back to the top (a new search, a status-bar tap) shows them.
      if (frame.y < 1 && scrolledAway) setScrolledAway(false)
      return
    }
    const next = trackBarsScroll(tracker, frame)
    if (next !== undefined && next !== scrolledAway) setScrolledAway(next)
  }

  const setUserDriven = (userDriven: boolean) => () => {
    scroll.current.userDriven = userDriven
  }

  const scrollProps: HideBarsScrollProps = {
    onScroll,
    scrollEventThrottle: 16,
    // Measured from where this drag starts, whichever scroll view it's in.
    onScrollBeginDrag: (e) => {
      const { tracker } = scroll.current
      scroll.current.userDriven = true
      tracker.lastY = e.nativeEvent.contentOffset.y
      tracker.anchorY = tracker.lastY
    },
    onScrollEndDrag: setUserDriven(false),
    onMomentumScrollBegin: setUserDriven(true),
    onMomentumScrollEnd: setUserDriven(false),
    onScrollToTop: reveal,
    onContentSizeChange: (_width, height) => {
      scroll.current.contentHeight = height
      revealIfFits()
    },
    onLayout: (e) => {
      scroll.current.viewportHeight = e.nativeEvent.layout.height
      revealIfFits()
    },
  }

  return { hidden, reveal, onScroll, scrollProps }
}
