import { useEffect, useEffectEvent, useState } from 'react'
import type { Coordinate } from '@/types/contact'
import {
  knownRoadLegs,
  loadRoadLegs,
  type RoadLegs,
} from '@/features/route-planning/lib/roadLegs'

const SETTLE_MS = 500

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
