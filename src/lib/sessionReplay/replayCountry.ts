import { useEffect, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import { readVisitorCountry } from '@/lib/readVisitorLocation'
import { replayOptInRequired } from '@/lib/sessionReplay/replayGate'

let country: string | null | undefined
let reading = false
const listeners = new Set<() => void>()

const settle = (value: string | null) => {
  country = value
  listeners.forEach((listener) => listener())
}

export const replayCountry = (): string | null | undefined => country

export const subscribeReplayCountry = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function readReplayCountry(): void {
  if (reading || Platform.OS !== 'web') return
  reading = true
  readVisitorCountry().then(settle, () => settle(null))
}

export function useReplayOptInRequired(): boolean {
  useEffect(readReplayCountry, [])
  const value = useSyncExternalStore(subscribeReplayCountry, replayCountry)
  return (
    Platform.OS === 'web' && value !== undefined && replayOptInRequired(value)
  )
}
