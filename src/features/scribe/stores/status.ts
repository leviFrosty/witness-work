import { create } from 'zustand'
import {
  DEFAULT_SCRIBE_LIMITS,
  type ScribeLimitsWire,
  type ScribeStatusWire,
} from '@/features/scribe/lib/wire'

/**
 * Why this device can't use Scribe AI right now, from what the session client
 * and earlier calls learned. Never found out by opening a session.
 */
export interface ScribeDeviceGate {
  /** It can never attest (simulator, no App Attest, no Google Play). */
  ineligible: boolean
  /** The last session open failed for a reason that may pass. */
  attestationUnavailable: boolean
  suspended: boolean
  /** Ww-api answered 426 this launch. */
  updateRequired: boolean
}

interface ScribeStatusState {
  /** The last good `GET /scribe/v1/status`; null until one succeeds. */
  status: ScribeStatusWire | null
  fetchedAt: number
  /** The last read failed (fail-open: `status` stays as it was). */
  failed: boolean
  gate: ScribeDeviceGate
  /** Dev builds: a fake client answers every call, so no device gate applies. */
  devClient: boolean
}

export const INITIAL_GATE: ScribeDeviceGate = {
  ineligible: false,
  attestationUnavailable: false,
  suspended: false,
  updateRequired: false,
}

/** Memory only: status is read again every launch. */
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
