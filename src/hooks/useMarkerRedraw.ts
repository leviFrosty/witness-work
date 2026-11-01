import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import type { MapMarker } from 'react-native-maps'

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

    const timer = setTimeout(() => ref.current?.redraw(), 250)
    return () => clearTimeout(timer)
  }, [signature])

  return {
    ref,
    tracksViewChanges: Platform.OS === 'android' && tracking,
  }
}
