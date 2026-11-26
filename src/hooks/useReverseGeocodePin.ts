import { useEffect, useState } from 'react'
import {
  reverseGeocodeCoordinate,
  type ReverseGeocodeResult,
} from '@/lib/reverseGeocode'
import type { Coordinate } from '@/types/contact'

export type ReverseGeocodeStatus = 'idle' | 'loading' | 'resolved' | 'empty'

export type ReverseGeocodePinState = {
  status: ReverseGeocodeStatus
  result: ReverseGeocodeResult | null
}

export default function useReverseGeocodePin({
  coordinate,
  enabled,
}: {
  coordinate: Coordinate | undefined
  enabled: boolean
}): ReverseGeocodePinState {
  const latitude = coordinate?.latitude
  const longitude = coordinate?.longitude

  const [state, setState] = useState<ReverseGeocodePinState>({
    status: 'idle',
    result: null,
  })

  useEffect(() => {
    if (!enabled || latitude === undefined || longitude === undefined) {
      setState({ status: 'idle', result: null })
      return
    }

    const controller = new AbortController()
    let active = true
    setState({ status: 'loading', result: null })

    void reverseGeocodeCoordinate(
      { latitude, longitude },
      { signal: controller.signal }
    ).then((result) => {
      if (!active || controller.signal.aborted) return
      setState(
        result
          ? { status: 'resolved', result }
          : { status: 'empty', result: null }
      )
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [enabled, latitude, longitude])

  return state
}
