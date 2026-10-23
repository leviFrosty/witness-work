import { useEffect, useEffectEvent, useState } from 'react'
import type { Coordinate } from '@/types/contact'
import {
  knownRoadLegs,
  loadRoadLegs,
  type RoadLegs,
} from '@/features/route-planning/lib/roadLegs'

/** Settle before asking, so dragging stops around asks once. */
const SETTLE_MS = 500

/**
 * Directions by road for each leg of `path` (start, stops, finish), as they
 * arrive. Legs not known yet are missing; they keep their estimates.
 */
export default function useRoadLegs(path: Coordinate[]): RoadLegs {
  const [legs, setLegs] = useState(knownRoadLegs)
  const signature = path
    .map((c) => `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`)
    .join('|')

  const load = useEffectEvent(async (signal: AbortSignal) => {
    if ((await loadRoadLegs(path, signal)) && !signal.aborted) {
      setLegs(knownRoadLegs())
    }
  })
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => void load(controller.signal), SETTLE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [signature])

  return legs
}
