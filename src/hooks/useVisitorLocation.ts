import { useEffect, useState } from 'react'
import { readVisitorLocation } from '@/lib/readVisitorLocation'
import type { VisitorLocation } from '@/lib/visitorLocation'

export type VisitorLocationState =
  | { status: 'loading' }
  | ({ status: 'ready' } & VisitorLocation)

export function useVisitorLocation(): VisitorLocationState {
  const [state, setState] = useState<VisitorLocationState>({
    status: 'loading',
  })
  useEffect(() => {
    let current = true
    void readVisitorLocation().then((location) => {
      if (current) setState({ status: 'ready', ...location })
    })
    return () => {
      current = false
    }
  }, [])
  return state
}
