import { useEffect, useRef } from 'react'
import { Gesture } from 'react-native-gesture-handler'
import { type SharedValue, useSharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import type { MapPoint } from '@/features/map/lib/pinGeometry'

export type LassoPoint = MapPoint

/** A new point once the finger moves this far, so the path stays light. */
const MIN_STEP = 4

/**
 * The lasso's pan. A hook of its own, so the React Compiler doesn't take
 * `onLoop`'s ref read for a render-time read and skip `useMapLasso`.
 */
function useLassoGesture(
  enabled: boolean,
  points: SharedValue<LassoPoint[]>,
  onLoop: (loop: LassoPoint[]) => void
) {
  // It calls no hook, so the compiler would leave it out and rebuild the pan
  // every render; this keeps it until `enabled` changes.
  'use memo'
  return Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .minDistance(8)
    .onStart((e) => {
      points.set([{ x: e.x, y: e.y }])
    })
    .onUpdate((e) => {
      const current = points.get()
      const last = current[current.length - 1]
      if (last && Math.hypot(e.x - last.x, e.y - last.y) < MIN_STEP) return
      points.set([...current, { x: e.x, y: e.y }])
    })
    .onEnd((_e, success) => {
      // A loop the system cancelled (a second finger, an incoming call)
      // picks nothing.
      if (success) scheduleOnRN(onLoop, points.get())
    })
    .onFinalize(() => {
      points.set([])
    })
}

/**
 * Select mode's lasso: one finger drags a loop over the map, and `onFinish`
 * gets the loop's points (in the map's points) when it lifts. The path lives on
 * the UI thread, so drawing doesn't re-render the map. Two fingers still pinch
 * the map, and taps still reach its pins.
 */
export default function useMapLasso({
  enabled,
  onFinish,
}: {
  enabled: boolean
  onFinish: (points: LassoPoint[]) => void
}) {
  const points = useSharedValue<LassoPoint[]>([])
  // Read when a loop ends, so the pan changes only with `enabled`.
  const onFinishRef = useRef(onFinish)
  useEffect(() => {
    onFinishRef.current = onFinish
  })
  const gesture = useLassoGesture(enabled, points, (loop) =>
    onFinishRef.current(loop)
  )
  return { gesture, points }
}
