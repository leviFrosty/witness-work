import {
  webDeviceName,
  webDeviceParts,
  type WebDeviceSignals,
} from '@/lib/webDeviceName'
import type { DeviceLabel } from '@/lib/serverAccount/deviceLabel'

export type BrowserAndSystem = { browser: string; system: string }

const signalsHere = (): WebDeviceSignals =>
  typeof navigator === 'undefined' ? {} : navigator

export function browserAndSystem(
  signals: WebDeviceSignals = signalsHere()
): BrowserAndSystem {
  const { browser, system } = webDeviceParts(signals)
  return { browser: browser ?? 'Browser', system: system ?? 'Web' }
}

export function webDeviceLabel(
  signals: WebDeviceSignals = signalsHere()
): DeviceLabel {
  return { name: webDeviceName(signals), platform: 'web', model: '' }
}
