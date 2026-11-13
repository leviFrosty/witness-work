import { useEffect, useEffectEvent, useState } from 'react'
import { AppState } from 'react-native'
import {
  askLocationAccess,
  checkLocationAccess,
  deviceLocationFix,
  locationShowsNotice,
  turnOnLocationServices,
  type LocationAccess,
} from '@/lib/locationPermission'
import { openAppSettings } from '@/lib/openAppSettings'

export default function useLocationAccess({
  enabled = true,
  precise = false,
}: {
  enabled?: boolean
  precise?: boolean
} = {}) {
  const [access, setAccess] = useState<LocationAccess | null>(null)
  const [declined, setDeclined] = useState(false)

  const refresh = async () => {
    const next = await checkLocationAccess({ precise })
    setAccess(next)
    return next
  }

  const look = useEffectEvent(() => {
    if (enabled) void refresh()
  })

  useEffect(() => {
    look()
  }, [enabled, precise])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') look()
    })
    return () => subscription.remove()
  }, [])

  const prompt = async () => {
    const next = await askLocationAccess({ precise })
    setAccess(next)
    if (next !== 'granted') setDeclined(true)
    return next
  }

  const request = async ({ again = false }: { again?: boolean } = {}) => {
    const now = await refresh()
    if (now === 'granted') return true
    if (now !== 'ask' && !(again && now === 'askAgain')) return false
    return (await prompt()) === 'granted'
  }

  const fix = deviceLocationFix(access)

  const runFix = async () => {
    if (fix === 'prompt') return void (await prompt())
    if (fix === 'turnOn') {
      await turnOnLocationServices()
      return void (await refresh())
    }
    if (fix === 'settings') await openAppSettings()
  }

  return {
    access,
    granted: access === 'granted',
    notice: enabled && locationShowsNotice({ access, declined }),
    fix,
    request,
    runFix: () => void runFix(),
    refresh,
  }
}
