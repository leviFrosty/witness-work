import { useEffect, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import { readVisitorCountry } from '@/lib/readVisitorLocation'
import { replayOptInRequired } from '@/lib/sessionReplay/replayGate'

/**
 * The visitor's country for session replay's opt-in (ADR 0043), read once per
 * launch. Until it's read, and when it can't be, it's unknown, which asks for
 * the opt-in.
 */

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

/** Starts the read, once. The web only; a phone has no recordings to ask about. */
export function readReplayCountry(): void {
  if (reading || Platform.OS !== 'web') return
  reading = true
  readVisitorCountry().then(settle, () => settle(null))
}

/**
 * Whether this visitor is asked before a recording: on the web, in a region or
 * of unknown country. False while the country is still being read.
 */
export function useReplayOptInRequired(): boolean {
  useEffect(readReplayCountry, [])
  const value = useSyncExternalStore(subscribeReplayCountry, replayCountry)
  return (
    Platform.OS === 'web' && value !== undefined && replayOptInRequired(value)
  )
}
