import { useEffect, useState, type RefObject } from 'react'
import { useWindowDimensions, type View } from 'react-native'
import { isOnScreen } from '@/lib/onScreen'

/** How often a scene checks whether it was scrolled out of view. */
const CHECK_MS = 500

/**
 * Whether the view is at least partly inside the window, sampled with
 * `measureInWindow` while `enabled` (layout doesn't change when a parent
 * scrolls, so there's no event to listen to). Keeps the last answer while
 * disabled.
 */
export default function useOnScreen(
  ref: RefObject<Pick<View, 'measureInWindow'> | null>,
  enabled: boolean
): boolean {
  const { width, height } = useWindowDimensions()
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    const measure = () =>
      ref.current?.measureInWindow((x, y, w, h) => {
        if (!disposed)
          setOnScreen(
            isOnScreen({ x, y, width: w, height: h }, { width, height })
          )
      })
    const timer = setInterval(measure, CHECK_MS)
    measure()
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [ref, enabled, width, height])
  return onScreen
}
