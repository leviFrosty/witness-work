import { useEffect } from 'react'
import { startSessionReplay } from '@/lib/sessionReplay/startSessionReplay'

/** Starts the web's masked session replay (ADR 0043) once launch work is due. */
export function useSessionReplay(enabled: boolean): void {
  useEffect(() => {
    if (enabled) startSessionReplay()
  }, [enabled])
}
