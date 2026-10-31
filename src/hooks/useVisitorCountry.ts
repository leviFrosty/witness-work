import { useEffect, useState } from 'react'
import { readVisitorCountry } from '@/lib/readVisitorCountry'

export type VisitorCountry =
  | { status: 'loading' }
  | { status: 'ready'; country: string | null }

/** The visitor's country for a screen; `loading` until the first read ends. */
export function useVisitorCountry(): VisitorCountry {
  const [state, setState] = useState<VisitorCountry>({ status: 'loading' })
  useEffect(() => {
    let current = true
    void readVisitorCountry().then((country) => {
      if (current) setState({ status: 'ready', country })
    })
    return () => {
      current = false
    }
  }, [])
  return state
}
