import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import type { Coordinate } from '@/types/contact'
import {
  refreshCurrentLocation,
  selectFreshCoordinate,
  useCurrentLocation,
} from '@/lib/currentLocation'

const LATE_FIX_WINDOW_MS = 1_000

type Snapshot = { here: Coordinate | null; at: number }

const takeSnapshot = (): Snapshot => ({
  here: selectFreshCoordinate(useCurrentLocation.getState()),
  at: Date.now(),
})

const sameDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString()

const keepIfSame = (previous: Snapshot, next: Snapshot) =>
  previous.here === next.here && sameDay(previous.at, next.at) ? previous : next

export default function useLocationSnapshot({
  enabled = true,
}: {
  enabled?: boolean
} = {}) {
  const [snapshot, setSnapshot] = useState(takeSnapshot)
  const interacted = useRef(false)
  const granted = useCurrentLocation((s) => s.granted)
  const canAsk = useCurrentLocation((s) => s.canAsk)

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return
      interacted.current = false
      const initial = takeSnapshot()
      setSnapshot((previous) => keepIfSame(previous, initial))
      if (initial.here) {
        void refreshCurrentLocation()
        return
      }
      const stop = useCurrentLocation.subscribe((state) => {
        const here = selectFreshCoordinate(state)
        if (!here) return
        stop()
        if (interacted.current) return
        setSnapshot({ here, at: initial.at })
      })
      const timer = setTimeout(stop, LATE_FIX_WINDOW_MS)
      void refreshCurrentLocation()
      return () => {
        clearTimeout(timer)
        stop()
      }
    }, [enabled])
  )

  return {
    here: snapshot.here,

    at: snapshot.at,

    showsHint: granted === false && canAsk,

    turnOn: async () => {
      const here = await refreshCurrentLocation({ prompt: true })
      if (here) setSnapshot({ here, at: Date.now() })
      return useCurrentLocation.getState().granted === true
    },

    markInteracted: () => {
      interacted.current = true
    },
  }
}
