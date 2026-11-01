import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { AppLockAvailability, getAppLockAvailability } from '@/lib/appLock'

export function useAppLockAvailability() {
  const [availability, setAvailability] = useState<AppLockAvailability | null>(
    null
  )

  useEffect(() => {
    let cancelled = false
    getAppLockAvailability()
      .then((next) => {
        if (!cancelled) setAvailability(next)
      })
      .catch(() => {
        if (!cancelled) {
          setAvailability({
            method: Platform.OS === 'ios' ? 'passcode' : 'biometrics',
            available: false,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return availability
}
