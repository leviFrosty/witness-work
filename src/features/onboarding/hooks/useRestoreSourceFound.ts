import { useEffect, useState } from 'react'
import { detectRestoreSource } from '@/features/onboarding/lib/restoreSource'

/**
 * Whether this device already sees something to restore
 * (`detectRestoreSource`), checked once while the welcome and tour show. False
 * until the check answers.
 */
export default function useRestoreSourceFound(): boolean {
  const [found, setFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    void detectRestoreSource().then((result) => {
      if (!cancelled) setFound(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return found
}
