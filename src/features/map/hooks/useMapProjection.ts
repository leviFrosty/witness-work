import { type RefObject, useRef, useState } from 'react'
import type MapView from 'react-native-maps'
import type { Region } from 'react-native-maps'
import { logger } from '@/lib/logger'
import { projectionFrom, type MapSize } from '@/lib/mapLabels'
import type { MapProjection } from '@/features/map/lib/mapPinLayout'

export default function useMapProjection(mapRef: RefObject<MapView | null>) {
  const [projection, setProjection] = useState<MapProjection | null>(null)
  const size = useRef<MapSize | null>(null)
  const region = useRef<Region | null>(null)

  const generation = useRef(0)

  const measure = () => {
    const map = mapRef.current
    const current = region.current
    const mapSize = size.current
    if (!map || !current || !mapSize) return
    const requested = ++generation.current
    const north = current.latitude + current.latitudeDelta / 2
    const south = current.latitude - current.latitudeDelta / 2
    const west = current.longitude - current.longitudeDelta / 2
    const east = current.longitude + current.longitudeDelta / 2
    const a = { latitude: north, longitude: west }
    const b = { latitude: south, longitude: east }
    Promise.all([map.pointForCoordinate(a), map.pointForCoordinate(b)])
      .then(([pointA, pointB]) => {
        if (requested !== generation.current) return
        const project = projectionFrom(
          { coordinate: a, point: pointA },
          { coordinate: b, point: pointB }
        )
        setProjection(project ? { project, size: mapSize } : null)
      })
      .catch((error: unknown) => {
        logger.warn('[Map] Could not read the map projection', error)
      })
  }

  return {
    projection,
    onRegionChangeComplete: (next: Region) => {
      region.current = next
      measure()
    },
    onLayout: (next: MapSize) => {
      const previous = size.current
      if (
        previous &&
        previous.width === next.width &&
        previous.height === next.height
      )
        return
      size.current = next
      measure()
    },
  }
}
