import { useEffect, useState } from 'react'
import { setDevRemountListener } from '@/lib/devRemount'

// Remount navigation without a bundle reload, preserving the profiler session.
export function useDevRemountKey() {
  const [key, setKey] = useState(0)
  useEffect(() => {
    if (!__DEV__) return
    setDevRemountListener(() => setKey((k) => k + 1))
    return () => setDevRemountListener(null)
  }, [])
  return key
}
