import { create } from 'zustand'
import {
  DEFAULT_SCRIBE_LIMITS,
  type ScribeLimitsWire,
  type ScribeStatusWire,
} from '@/features/scribe/lib/wire'

export interface ScribeDeviceGate {
  ineligible: boolean

  attestationUnavailable: boolean
  suspended: boolean

  updateRequired: boolean
}

interface ScribeStatusState {
  status: ScribeStatusWire | null
  fetchedAt: number

  failed: boolean
  gate: ScribeDeviceGate

  devClient: boolean
}

export const INITIAL_GATE: ScribeDeviceGate = {
  ineligible: false,
  attestationUnavailable: false,
  suspended: false,
  updateRequired: false,
}

export const useScribeStatusStore = create<ScribeStatusState>()(() => ({
  status: null,
  fetchedAt: 0,
  failed: false,
  gate: INITIAL_GATE,
  devClient: false,
}))

export const scribeLimits = (): ScribeLimitsWire =>
  useScribeStatusStore.getState().status?.limits ?? DEFAULT_SCRIBE_LIMITS

export function noteGate(change: Partial<ScribeDeviceGate>): void {
  const { gate } = useScribeStatusStore.getState()
  if (
    Object.entries(change).every(
      ([key, value]) => gate[key as keyof ScribeDeviceGate] === value
    )
  )
    return
  useScribeStatusStore.setState({ gate: { ...gate, ...change } })
}
