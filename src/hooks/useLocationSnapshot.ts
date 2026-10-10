import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import type { Coordinate } from '@/types/contact'
import {
  refreshCurrentLocation,
  selectFreshCoordinate,
  useCurrentLocation,
} from '@/lib/currentLocation'

/**
 * A first fix this soon after focus still counts, as long as the User hasn't
 * touched the list: rows can't move under them yet.
 */
const LATE_FIX_WINDOW_MS = 1_000

type Snapshot = { here: Coordinate | null; at: number }

const takeSnapshot = (): Snapshot => ({
  here: selectFreshCoordinate(useCurrentLocation.getState()),
  at: Date.now(),
})

const sameDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString()

/** Same place (same fix) on the same day suggests the same Contacts. */
const keepIfSame = (previous: Snapshot, next: Snapshot) =>
  previous.here === next.here && sameDay(previous.at, next.at) ? previous : next

/**
 * Where the User stands (`here`) and when (`at`), for suggesting Nearby
 * Contacts. Both are read once each time the screen gains focus, so a fix that
 * arrives while the User is reading can't reorder the list; the next focus
 * picks it up. The only exceptions: a first fix within
 * {@link LATE_FIX_WINDOW_MS} of focus before the User touches the list (call
 * `markInteracted` from its touches), and `turnOn`, which they asked for.
 *
 * Reads location only when the User already allowed it; only `turnOn` asks.
 * Shared by the Contacts list and the Log Visit picker.
 */
export default function useLocationSnapshot({
  enabled = true,
}: {
  /** False while the screen doesn't suggest Contacts (e.g. another sort). */
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
        // Ready for the next focus.
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
    /** "Now" for the suggestions, e.g. which Follow-ups are due today. */
    at: snapshot.at,
    /** Never asked, or the OS will still ask again; hidden once denied. */
    showsHint: granted === false && canAsk,
    /** Asks for location (the one place that prompts); true when allowed. */
    turnOn: async () => {
      const here = await refreshCurrentLocation({ prompt: true })
      if (here) setSnapshot({ here, at: Date.now() })
      return useCurrentLocation.getState().granted === true
    },
    /** The User touched the list; a late fix no longer reorders it. */
    markInteracted: () => {
      interacted.current = true
    },
  }
}
