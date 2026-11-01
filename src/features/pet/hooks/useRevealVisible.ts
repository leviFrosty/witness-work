import { useEffect, useState, type RefObject } from 'react'
import { useWindowDimensions, type View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useAppActive from '@/hooks/useAppActive'
import { useTabBarHidden } from '@/stores/tabBarVisibility'

const CHECK_MS = 250

const TOP_CLEAR = 64

const BOTTOM_CLEAR = 72

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
