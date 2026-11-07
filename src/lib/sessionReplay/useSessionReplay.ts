import { useEffect } from 'react'
import { startSessionReplay } from '@/lib/sessionReplay/startSessionReplay'

export function useSessionReplay(enabled: boolean): void {
  useEffect(() => {
    if (enabled) startSessionReplay()
  }, [enabled])
}
