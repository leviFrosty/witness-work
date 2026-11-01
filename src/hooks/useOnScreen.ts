import { useEffect, useState, type RefObject } from 'react'
import { useWindowDimensions, type View } from 'react-native'
import { isOnScreen } from '@/lib/onScreen'

const CHECK_MS = 500

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
