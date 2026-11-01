import { useEffect } from 'react'
import { AppState } from 'react-native'
import * as Brightness from 'expo-brightness'
import { logger } from '@/lib/logger'

export default function useFullBrightness() {
  useEffect(() => {
    let previous: number | null = null
    let closed = false
    const raise = async () => {
      const level = await Brightness.getBrightnessAsync()

      if (closed || AppState.currentState === 'background') return
      previous ??= level
      await Brightness.setBrightnessAsync(1)
    }
    const restore = async () => {
      if (previous === null) return
      const level = previous
      previous = null
      await Brightness.setBrightnessAsync(level)
    }
    const log = (error: unknown) => logger.warn('[brightness]', error)
    void raise().catch(log)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void raise().catch(log)
      else void restore().catch(log)
    })
    return () => {
      closed = true
      subscription.remove()
      void restore().catch(log)
    }
  }, [])
}
