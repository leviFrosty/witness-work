import { useEffect, useState, type RefObject } from 'react'
import { useWindowDimensions, type View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useAppActive from '@/hooks/useAppActive'
import { useTabBarHidden } from '@/stores/tabBarVisibility'

/** How often it checks where the view is while it waits. */
const CHECK_MS = 250
/** Kept clear below the top inset: a screen's title bar drawn over its content. */
const TOP_CLEAR = 64
/** Kept clear above the bottom edge: a tab bar or the Quick Action button. */
const BOTTOM_CLEAR = 72

/**
 * Whether the User can really see the view: its screen focused, the app in
 * front, and all of it inside the window clear of the bars for two checks in a
 * row (a scroll passing by doesn't count). Checks only while `enabled`, with
 * `measureInWindow`, since scrolling a parent changes no layout to listen to.
 * Scrolling down tucks a root screen's header away with the tab bar
 * (`useHideBarsOnScroll`); then only the safe area is in the way.
 */
export default function useRevealVisible(
  ref: RefObject<Pick<View, 'measureInWindow'> | null>,
  enabled: boolean
): boolean {
  const focused = useIsFocused()
  const active = useAppActive()
  const { width, height } = useWindowDimensions()
  const { top, bottom } = useSafeAreaInsets()
  const barsAway = useTabBarHidden()
  const topClear = top + (barsAway ? 0 : TOP_CLEAR)
  const bottomClear = bottom + (barsAway ? 0 : BOTTOM_CLEAR)
  const [visible, setVisible] = useState(false)
  const on = enabled && focused && active
  useEffect(() => {
    if (!on) return
    let disposed = false
    let inside = 0
    const check = () =>
      ref.current?.measureInWindow((x, y, w, h) => {
        if (disposed || w <= 0 || h <= 0) return
        const whole =
          x >= 0 &&
          x + w <= width &&
          y >= topClear &&
          y + h <= height - bottomClear
        inside = whole ? inside + 1 : 0
        setVisible(inside >= 2)
      })
    const timer = setInterval(check, CHECK_MS)
    check()
    return () => {
      disposed = true
      clearInterval(timer)
      setVisible(false)
    }
  }, [on, ref, width, height, topClear, bottomClear])
  return on && visible
}
