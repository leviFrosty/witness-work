import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import type { MapMarker } from 'react-native-maps'

/**
 * Keeps a custom map marker's picture current. Android draws marker views as
 * bitmaps: it tracks view changes for a moment after the marker mounts, and
 * redraws it outright when `signature` changes, since tracking alone skips a
 * marker whose own props didn't change. Put everything the marker draws with
 * (including theme colors) in `signature`. Pass `ref` and `tracksViewChanges`
 * to the `Marker`. iOS draws marker views live, so it does nothing there.
 */
export default function useMarkerRedraw(signature: string) {
  const ref = useRef<MapMarker>(null)
  const [tracking, setTracking] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setTracking(false), 500)
    return () => clearTimeout(timer)
  }, [])

  const drawn = useRef(signature)
  useEffect(() => {
    if (Platform.OS !== 'android' || drawn.current === signature) return
    drawn.current = signature
    ref.current?.redraw()
    // Again once the change has surely reached the native views.
    const timer = setTimeout(() => ref.current?.redraw(), 250)
    return () => clearTimeout(timer)
  }, [signature])

  return {
    ref,
    tracksViewChanges: Platform.OS === 'android' && tracking,
  }
}
