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

export default function useHideBarsOnScroll({
  enabled = true,
  paused = false,
  resetKey,
}: {
  enabled?: boolean

  paused?: boolean

  resetKey?: string
} = {}) {
  const { isWide, hasSidebar } = useAdaptiveLayout()
  const { fontScale } = useWindowDimensions()
  const screenReader = useScreenReaderEnabled()
  const isFocused = useIsFocused()

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

    contentHeight: 0,
    viewportHeight: 0,
  })

  useEffect(() => {
    scroll.current.userDriven = false
  }, [active, paused])

  const reveal = () => {
    const { tracker } = scroll.current
    tracker.anchorY = tracker.lastY
    scroll.current.userDriven = false
    setScrolledAway(false)
  }

  useTabReselect(() => {
    if (scrolledAway && !paused) reveal()
  })

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

    if (!active) {
      if (userDriven && frame.y < 1 && scrolledAway) setScrolledAway(false)
      return
    }
    if (!userDriven || paused) {
      tracker.lastY = frame.y
      tracker.anchorY = frame.y
      tracker.contentHeight = frame.contentHeight
      tracker.viewportHeight = frame.viewportHeight

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
